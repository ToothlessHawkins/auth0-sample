const express = require("express");
const morgan = require("morgan");
const helmet = require("helmet");
const jwt = require("express-jwt");
var jwtAuthz = require('express-jwt-authz');
const jwksRsa = require("jwks-rsa");
const { join } = require("path");
const authConfig = require("./auth_config.json");

var axios = require("axios").default;

const app = express();

if (!authConfig.domain || !authConfig.audience) {
  throw "Please make sure that auth_config.json is in place and populated";
}

app.use(morgan("dev"));
app.use(helmet());
app.use(express.static(join(__dirname, "public")));

const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${authConfig.domain}/.well-known/jwks.json`
  }),

  audience: authConfig.audience,
  issuer: `https://${authConfig.domain}/`,
  algorithms: ["RS256"]
});

// using authz here to validate scope of user in jwt
const checkScope = jwtAuthz(['order:pizza']);

function getManagementAccessToken() {
  return new Promise(function (resolve, reject) {
    // get access token - ideally not hard coded
    var options = {
      method: 'POST',
      url: 'https://dev-jjohntest.us.auth0.com/oauth/token',
      headers: {'content-type': 'application/json'},
      data: {
        grant_type: 'client_credentials',
        client_id: 'm7IFDVms4O3lSEoLwWxLK63hopsaWIF7',
        client_secret: '2zga0dsn5Dra2IwJkLkTamZx-geTs2JvlLMivLIC9eep2iQxuZCUl899fgERKmnr',
        audience: 'https://dev-jjohntest.us.auth0.com/api/v2/'
      }
    };

    axios.request(options).then(function (response) {
      console.log("successfully generated management_access_token!");
      resolve(response.data.access_token);
    }).catch(function (error) {
      console.log("there was an error");
      console.error(error);
      reject(error);
    });
  });
}

function getUserMetadata (token, userId) {
  return new Promise(function (resolve, reject) {
    var options = {
      method: 'GET',
      url: 'https://dev-jjohntest.us.auth0.com/api/v2/users/' + userId,
      headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'}
    };

    axios.request(options).then(function (response) {
      console.log("successfully retrieved user orders!");
      // console.log(response.data.user_metadata);
      resolve(response.data.user_metadata);
    }).catch(function (error) {
      console.error(error);
      reject(error);
    });
  });
}

function setUserMetadata (token, userId, userOrders) {
  return new Promise(function (resolve, reject) {
    var options = {
      method: 'PATCH',
      url: 'https://dev-jjohntest.us.auth0.com/api/v2/users/' + userId,
      headers: {authorization: 'Bearer ' + token, 'content-type': 'application/json'},
      data: {user_metadata: {orders: userOrders}}
    };

    axios.request(options).then(function (response) {
      console.log("successfully updated user orders!");
      // console.log(response.data.user_metadata);
      resolve(response.data);
    }).catch(function (error) {
      console.error(error);
      reject(error);
    });
  });
}

async function updateUserWithOrderId(orderId, userId) {
  
  var token = await getManagementAccessToken();

  // console.log("awaited access token: " + token);

  // first fetch user metadata
  var userMetadata = await getUserMetadata(token, userId);

  // console.log("awaited metadata: " + Object.keys(userMetadata));
  // make either empty array or array of user's old orders
  var user_orders = [];
  if (userMetadata && userMetadata.hasOwnProperty('orders')) {
    user_orders = userMetadata.orders;
  };

  // console.log("awaited and updated user orders: " + user_orders);
  user_orders.push(orderId);
  var updateOrdersRes = await setUserMetadata(token, userId, user_orders);

  return updateOrdersRes;
  // console.log("made it");
  // console.log(updateOrdersRes);
}


app.get("/api/external/pizza", checkJwt, checkScope, (req, res) => {
  var randomId = Math.floor(Math.random() * 10000);
  updateUserWithOrderId(randomId, req.user.sub).then(function (result) {
    console.log("updateRes: " + result.user_metadata.orders);
    res.send({
      msg: "Your pizza is on the way!",
      orderId: randomId,
      previousOrders: result.user_metadata.orders
    });
  });
});

app.get("/auth_config.json", (req, res) => {
  res.sendFile(join(__dirname, "auth_config.json"));
});

app.get("/*", (req, res) => {
  res.sendFile(join(__dirname, "index.html"));
});

app.use(function(err, req, res, next) {
  if (err.name === "UnauthorizedError") {
    return res.status(401).send({ msg: "Invalid token" });
  }

  next(err, req, res);
});

process.on("SIGINT", function() {
  process.exit();
});

module.exports = app;
