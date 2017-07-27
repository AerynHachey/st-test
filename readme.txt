Project was built using node 6.11.1. Setup is fairly typical for a node project.
Clone from the repo then run npm install in the node folder. The app expects
the environment variables API_HOST to point to the server host and API_TOKEN to
contain the authorization token. Once it's running the api calls mirror those of
the api server used in the test.

Commands for copying and pasting:

Running the project:
env API_HOST="<host>" API_TOKEN="<token>" node index.js

Testing the API call with a browser:
/meters/cf442638-f9f1-11e6-bc64-92361f002671/peak?from=1498521000&to=1501114638

List of meter IDs:
cf442638-f9f1-11e6-bc64-92361f002671
4e8bbc46-05da-11e7-93ae-92361f002671
740732ec-0338-11e7-93ae-92361f002671
77ce0702-0338-11e7-93ae-92361f002671