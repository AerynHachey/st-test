"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
var express = require("express");
var redis = require("redis");
var https = require("https");
var app = express();
var redisClient = redis.createClient();
var apiHost = process.env.API_HOST;
var apiToken = process.env.API_TOKEN;
app.use("/meters/:meterId/peak", function (req, res) {
    if (req.query.from && req.query.to) {
        getBillablePeak(req.params.meterId, req.query.from, req.query.to, function (billablePeak, timestamp) {
            res.send(JSON.stringify({ "timestamp": timestamp, "billable_peak": billablePeak }));
        });
    }
});
redisClient.on("error", function (error) {
    console.log("A redis error has occurred. Error data: " + JSON.stringify(error));
});
app.listen(8080, function () {
    console.log("App listening on port 8080.");
});
function getHttpsOptionsWithPath(path) {
    var test = {
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
function getBillablePeak(meterId, startTime, endTime, callback) {
    var keyName = "billablePeak_" + meterId + startTime.toString() + endTime.toString();
    redisClient.hgetall(keyName, function (error, results) {
        if (results) {
            //Requested data was found in the cache.
            var meterPeak = results;
            callback(parseInt(meterPeak.billable_peak), parseInt(meterPeak.timestamp));
            return;
        }
        else {
            //Couldn't find the requested data in the cache. Query the api, calculate the billable peak, cache it, then pass it to the callback.
            var queryTarget = "/v1/meters/" + meterId + "/power?from=" + startTime.toString() + "&to=" + endTime.toString();
            https.get(getHttpsOptionsWithPath(queryTarget), function (res) {
                var meterDataString = "";
                res.on("data", function (data) {
                    meterDataString += data;
                });
                res.on("end", function () {
                    var meterData = JSON.parse(meterDataString);
                    if (meterData.length > 15) {
                        var highestPeak = 0;
                        var peakTimestamp = 0;
                        for (var i = 0; i < meterData.length; i++) {
                            if (i > 7 && i < meterData.length - 8) {
                                var peakTotal = calculateMeterArraySegmentAverage(meterData, i - 7, i - 3);
                                peakTotal += calculateMeterArraySegmentAverage(meterData, i - 2, i + 2);
                                peakTotal += calculateMeterArraySegmentAverage(meterData, i + 3, i + 7);
                                var peak = peakTotal / 3;
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
                res.on("error", function (error) {
                    console.log("An error occured when trying to query the api. Error data: " + JSON.stringify(error));
                });
            });
        }
    });
}
function calculateMeterArraySegmentAverage(array, startIndex, endIndex) {
    var total = 0;
    for (var i = startIndex; i <= endIndex; i++) {
        total += array[i].watts;
    }
    return total / (endIndex - startIndex + 1);
}
