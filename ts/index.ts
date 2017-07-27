import * as express from "express";
import * as redis from "redis";
import * as https from "https";

let app = express();
let redisClient = redis.createClient();

let apiHost = process.env.API_HOST;
let apiToken = process.env.API_TOKEN;

app.use("/meters/:meterId/peak", (req: express.Request, res: express.Response) => {
    if (req.query.from && req.query.to) {
        getBillablePeak(req.params.meterId, req.query.from, req.query.to, (billablePeak: number, timestamp: number) => {
            res.send(JSON.stringify({"timestamp": timestamp, "billable_peak": billablePeak }));
        });
    }
});

redisClient.on("error", (error: any) => {
    console.log("A redis error has occurred. Error data: " + JSON.stringify(error));
});

app.listen(8080, () => {
    console.log("App listening on port 8080.");
});

function getHttpsOptionsWithPath(path: string): any {
    let test: any = {
        host: apiHost,
        port: 443,
        path: path,
        headers: {
            "Authorization": "Bearer " + apiToken
        }
    };
    return test;
}

/**
 * Calculates the billable peak for a given meter ID and time range.
 * @param meterId 
 * @param startTime Start of the time range to calculate for as a UNIX timestamp in seconds.
 * @param endTime End of the time range to calculate for as a UNIX timestamp in seconds.
 * @param callback 
 */
function getBillablePeak(meterId: string, startTime: number, endTime: number, callback: (billablePeak: number, timestamp: number) => void) {
    let keyName: string = "billablePeak_" + meterId + startTime.toString() + endTime.toString();
    redisClient.hgetall(keyName, (error: any, results: any) => {
        if (results) {
            //Requested data was found in the cache.
            let meterPeak = results;
            callback(parseInt(meterPeak.billable_peak), parseInt(meterPeak.timestamp));
            return;
        } else {
            //Couldn't find the requested data in the cache. Query the api, calculate the billable peak, cache it, then pass it to the callback.
            let queryTarget: string = "/v1/meters/" + meterId + "/power?from=" + startTime.toString() + "&to=" + endTime.toString();

            https.get(getHttpsOptionsWithPath(queryTarget), (res: https.IncomingMessage) => {
                let meterDataString = "";
                res.on("data", (data: any) => {
                    meterDataString += data;
                });

                res.on("end", () => {
                    let meterData: any[] = JSON.parse(meterDataString);
                    if (meterData.length > 15) { //Ensure that there's enough data to measure.
                        let highestPeak: number = 0;
                        let peakTimestamp: number = 0;
                        for (let i: number = 0; i < meterData.length; i++) {
                            if (i > 7 && i < meterData.length - 8) {
                                let peakTotal: number = calculateMeterArraySegmentAverage(meterData, i - 7, i - 3);
                                peakTotal += calculateMeterArraySegmentAverage(meterData, i - 2, i + 2);
                                peakTotal += calculateMeterArraySegmentAverage(meterData, i + 3, i + 7);
                                let peak: number = peakTotal / 3;
                                if (peak > highestPeak) {
                                    highestPeak = peak;
                                    peakTimestamp = meterData[i].timestamp;
                                }
                            }
                        }
                        highestPeak = Math.floor(highestPeak);
                        peakTimestamp = Math.floor(peakTimestamp / 1000); //Convert the milliseconds returned from the server to the seconds required by the spec
                        redisClient.hmset(keyName, ["billable_peak", highestPeak, "timestamp", peakTimestamp]);
                        callback(highestPeak, peakTimestamp);
                        return;
                    }
                });

                res.on("error", (error: Error) => {
                    console.log("An error occured when trying to query the api. Error data: " + JSON.stringify(error));
                });
            });
        }
    });
}

function calculateMeterArraySegmentAverage(array: any[], startIndex: number, endIndex: number) {
    let total: number = 0;
    for (let i: number = startIndex; i <= endIndex; i++) {
        total += array[i].watts;
    }
    return total / (endIndex - startIndex + 1);
}

