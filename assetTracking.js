/* eslint-disable no-restricted-syntax */
// Requiring some constants
const Analysis = require('tago/analysis');
const Utils = require('tago/utils');
const Device = require('tago/device');
const Services = require('tago/services');
const Account = require('tago/account');
const moment = require('moment');

async function toTagoFormat(objectItem, serie, prefix = '') {
  const result = [];
  for (const key in objectItem) {
    if (typeof objectItem[key] === 'object') {
      result.push({
        variable: objectItem[key].variable || `${prefix}${key}`,
        value: objectItem[key].value,
        serie: objectItem[key].serie || serie,
        metadata: objectItem[key].metadata,
        location: objectItem[key].location,
        unit: objectItem[key].unit,
      });
    } else {
      result.push({
        variable: `${prefix}${key}`,
        value: objectItem[key],
        serie,
      });
    }
  }

  return result;
}

/**
 * Checks if point is inside polygon.
 * @param {Array} point Array that contains point's latitude and longitude
 * @param {Object} geofence Object that contains the geofence points
 */
async function insidePolygon(point, geofence) {
  const x = point[0];
  const y = point[1];

  let inside = false;
  // eslint-disable-next-line no-plusplus
  for (let i = 0, j = geofence.length - 1; i < geofence.length; j = i++) {
    const xi = geofence[i][0];
    const yi = geofence[i][1];
    const xj = geofence[j][0];
    const yj = geofence[j][1];
    const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Function that set parameters to pass to insidePolygon function.
 * @param {Object} geofence Object that contains the geofence points
 * @param {Number} latitude Current latitude of asset
 * @param {Number} longitude Current longitude of asset
 */
async function checkPolygon(geofence, latitude, longitude, context) {
  return new Promise((resolve) => {
    const monitoredAreaLocation = geofence.metadata.geolocation.coordinates;
    const assetLocation = [latitude, longitude];
    const isInside = insidePolygon(assetLocation, monitoredAreaLocation[0]);
    resolve(isInside);
  }).catch(err => context.log(err.message));
}

/**
 * Sends an email using parameters passed to function.
 * @param {String} email Object needed to send emails from our analysis
 * @param {String} subject String used as subject of email that will be sent
 * @param {String} message String used as message of email that will be sent
 * @param {Device} device Object needed to use our device
 * @param {Context} context Context of our script
 */
async function sendEmail(email, subject, message, device, context) {
  const emailAddressFilter = {
    variable: ['email', 'pushnotifications'],
    query: 'last_value',
  };
  const resultArray = await device.find(emailAddressFilter).catch(err => context.log(err.message));
  if (!resultArray[0]) return context.log('Missing e-mail, please set your email on dashboard settings tab.');

  const to = resultArray[0].value;

  if (resultArray[1] && resultArray[1].value === true) email.send(to, subject, message).catch(err => context.log(err.message));

  return context.log('Email sent!');
}

async function assetInsideGeofence(data, geofenceArray, allStatus, device, context) {
  const dataToInsert = await toTagoFormat({
    exceededMaxTilt: {
      value: false,
    },
    leftTemperatureZone: {
      value: false,
    },
    reachedTiltLimit: {
      value: 0,
    },
    lastStatus: {
      value: 1,
      metadata: {
        insideLastTime: 'i',
        geofenceEvent: geofenceArray[allStatus.indexOf(true)].metadata.event,
      },
    },
    maximumTilt: {
      value: 0,
      unit: '°',
    },
  });
  await device.insert(dataToInsert).catch(error => context.log(error.message));

  if (!data.lastStatus) return context.log('lastStatus variable undefined');

  if (data.pushNotifications && !data.pushNotifications.value) return context.log('Notifications disabled');

  if (geofenceArray[allStatus.indexOf(true)].metadata.event != 1 || data.lastStatus.metadata.insideLastTime != 'o') return context.log('This case does not need notification');

  const title = `Your asset ${data.deviceName.name} entered geofence`;
  const message = `Your asset entered the geofence on ${data.time}`;
  return sendEmail(data.email, title, message, device, context);
}

async function assetOutsideGeofences(data, device, context) {
  const dataToInsert = await toTagoFormat({
    lastStatus: {
      value: 1,
      metadata: {
        insideLastTime: 'o',
        geofenceEvent: 0,
      },
    },
  });
  await device.insert(dataToInsert).catch(error => context.log(error.message));

  if (!data.lastStatus) return context.log('lastStatus variable undefined');

  if (data.lastStatus.metadata.insideLastTime != 'i' || data.lastStatus.metadata.geofenceEvent != 2) return context.log('This case does not need notification');

  if (data.pushNotifications && !data.pushNotifications.value) return context.log('Notifications disabled');

  const title = `Your asset ${data.deviceName.name} left geofence`;
  const message = `Your asset left the geofence on ${data.time}`;
  return sendEmail(data.email, title, message, device, context);
}

/**
 * Verifies if the asset left/entered a geofence.  If it left a geofence configured to
 * get warnings when the asset left it, the user will receive a notification.
 * Same situation applies when he enters specifical geofences.
 * @param {String} time Date and time when notification was sent
 * @param {String} email Object needed to send emails from our analysis
 * @param {Boolean} pushNotifications Used to check if notifications is turned on/off in dashboard
 * @param {String} dashboardId Dashboard ID
 * @param {String} deviceName Name of the device that is sending all data to the bucket
 * @param {Object} Notification Object used to send push notifications
 * @param {Object} lastStatus Object that contains last status of asset
 * @param {Number} latitude Current latitude of asset
 * @param {Number} longitude Current longitude of asset
 * @param {Device} device Object needed to use our device
 * @param {Context} context Context of our script
 */
// eslint-disable-next-line consistent-return
async function verifyPushNotification(data, device, context) {
  const geofenceFilter = {
    variable: 'geofences',
    qty: 4,
  };
  const geofenceArray = await device.find(geofenceFilter).catch(err => context.log(err.message));
  const arrayOfStatus = [];

  if (!geofenceArray[0]) return context.log('There is no geofences to verify!');

  geofenceArray.forEach((geofence) => {
    arrayOfStatus.push(checkPolygon(geofence, data.latitude, data.longitude, context));
  });

  const allStatus = await Promise.all(arrayOfStatus);
  if (allStatus.includes(true)) {
    await assetInsideGeofence(data, geofenceArray, allStatus, device, context);
  } else {
    await assetOutsideGeofences(data, device, context);
  }
}

/**
 * Verifies if current tilt exceeded tilt limit set by user, if it exceeded
 * an e-mail will be sent to notify the user.
 * @param {String} time Date and time when notification was sent
 * @param {String} deviceName Name of device
 * @param {String} email Object needed to send emails from our analysis
 * @param {Number} tilt Current tilt of asset
 * @param {Device} device Object needed to use our device
 * @param {Context} context Context of our script
 */
async function verifyTilt(time, deviceName, email, tilt, device, context) {
  let tiltLimit;
  const tiltLimitFilter = {
    variable: 'tiltlimit',
    query: 'last_item',
  };
  const resultArray = await device.find(tiltLimitFilter).catch(err => context.log(err.message));
  if (!resultArray[0]) {
    tiltLimit = 15;
  } else {
    tiltLimit = resultArray[0].value;
  }
  if (Math.abs(tilt) > Math.abs(tiltLimit)) {
    const dataToInsert = await toTagoFormat({
      exceededMaxTilt: {
        value: true,
      },
    });
    await device.insert(dataToInsert).catch(error => context.log(error.message));
    const title = `Your asset ${deviceName} exceeded tilt limit`;
    const message = `Your asset exceeded tilt limit defined by ${Math.abs(tiltLimit)} degree on ${time}. Tilt reached: ${tilt} degree.`;
    sendEmail(email, title, message, device, context);
  }
}

/**
 * Verifies if current temperature left temperature zone
 * set by user, if it is outside of temperature zone
 * an e-mail will be sent to notify the user.
 * @param {String} time Date and time when notification was sent
 * @param {String} name Name of device
 * @param {String} email Object needed to send emails from our analysis
 * @param {Number} temperature Current temperature of asset
 * @param {Device} device Object needed to use our device
 * @param {Context} context Context of our script
 */
async function verifyTemperatureZone(data, device, context) {
  const temperatureLimits = {
    variable: ['mintemperature', 'maxtemperature'],
    query: 'last_item',
  };
  const resultArray = await device.find(temperatureLimits).catch(err => context.log(err.message));
  const minTemp = resultArray[0] ? resultArray[0].value : 40;
  const maxTemp = resultArray[1] ? resultArray[1].value : 90;
  if (data.temperature > maxTemp || data.temperature < minTemp) {
    const dataToInsert = await toTagoFormat({
      leftTemperatureZone: {
        value: true,
      },
    });
    await device.insert(dataToInsert).catch(error => context.log(error.message));

    const title = `Your asset ${data.name} left temperature zone`;
    const message = `Your asset left the temperature zone defined by ${minTemp} and ${maxTemp} on ${data.time}. Temperature reached: ${data.temperature}°F.`;
    sendEmail(data.email, title, message, device, context);
  }
}

/**
 * Function to coordinate other functions that will verify tilt and temperature.
 * @param {String} time Date and time when notification was sent
 * @param {String} name Name of device
 * @param {String} email Object needed to send emails from our analysis
 * @param {Number} tilt Current tilt of asset
 * @param {Number} temperature Current temperature of asset
 * @param {Device} device Object needed to use our device
 * @param {Context} context Context of our script
 */
async function assetHistory(time, name, email, tilt, temperature, device, context) {
  const conditionVariables = {
    variable: ['exceededMaxTilt', 'leftTemperatureZone'],
    query: 'last_item',
  };
  const resultArray = await device.find(conditionVariables).catch(err => context.log(err.message));
  const exceededMaxTilt = !resultArray[0] ? false : resultArray[0].value;
  const leftTemperatureZone = !resultArray[1] ? false : resultArray[1].value;

  const data = {
    time,
    name,
    email,
    temperature,
  };
  if (!leftTemperatureZone) verifyTemperatureZone(data, device, context);
  if (!exceededMaxTilt) verifyTilt(time, name, email, tilt, device, context);
}

/**
 * Function to send push notifications using parameters passed to function.
 * @param {Object} Notification Object used to send push notifications
 * @param {String} title String used as notification title
 * @param {String} message String used as notification message
 * @param {String} dashboardId Dashboard ID
 * @param {Context} context Context of our script
 */
// async function sendPushNotifications(Notification, title, message, dashboardId, context) {
//   Notification.send(title, message, dashboardId)
//     .then(context.log('Notification sent!'))
//     .catch(err => context.log(err.message));
// }

/**
 * Checks maximum tilt during asset shipping (if asset is in a geofence, max tilt is reset to zero)
 * @param {Device} device
 * @param {Context} context
 */
async function insertMaximumTilt(device, context) {
  const minimumFilter = {
    variable: 'tilt',
    query: 'min',
  };
  const minimumTilt = await device.find(minimumFilter).catch(err => context.log(err.message));

  const maximumFilter = {
    variable: 'tilt',
    query: 'max',
  };
  let maximumTilt = await device.find(maximumFilter).catch(err => context.log(err.message));
  maximumTilt = Math.max(Math.abs(minimumTilt), maximumTilt);
  let dataToInsert = await toTagoFormat({
    maximumTilt: {
      value: maximumTilt,
      unit: '°',
    },
  });
  await device.insert(dataToInsert).catch(error => context.log(error.message));

  const tiltLimitFilter = {
    variable: 'tiltLimit',
    query: 'last_value',
  };
  let tiltLimit = await device.find(tiltLimitFilter).catch(err => context.log(err.message));
  if (!tiltLimit) tiltLimit = 15;

  dataToInsert = await toTagoFormat({
    tiltLimit: {
      value: tiltLimit,
    },
  });
  await device.insert(dataToInsert).catch(error => context.log(error.message));

  dataToInsert = await toTagoFormat({ reachedTiltLimit: { value: 1 } });

  if (Math.abs(maximumTilt) <= Math.abs(tiltLimit)) dataToInsert = await toTagoFormat({ reachedTiltLimit: { value: 0 } });

  await device.insert(dataToInsert).catch(error => context.log(error.message));
}

/**
 * Main function
 * @param {Context} context Context of our script
 */
// eslint-disable-next-line consistent-return
async function myAnalysis(context) {
  // Configurating device, services and account objects
  const envVars = Utils.env_to_obj(context.environment);
  if (!envVars.device_token) return context.log('Missing device_token environment variable');
  if (!envVars.dashboard_id) return context.log('Missing dashboard_id environment variable');
  if (!envVars.account_token) return context.log('Missing account_token environment variable');
  const accountDevices = new Account(envVars.account_token).devices;
  const device = new Device(envVars.device_token);
  const dashboardId = envVars.dashboard_id;
  const {
    Notification,
  } = new Services(context.token);
  const {
    email,
  } = new Services(context.token);

  // Creating string with current time
  let time = moment().utc();
  time = moment(time).local();
  time = time.format('MMMM Do YYYY, h:mm:ss a');

  // Filter to get last value of those variables
  const referenceFilter = {
    variable: ['lat', 'lng', 'temperature', 'tilt', 'battery', 'lastStatus', 'pushnotifications'],
    query: 'last_value',
  };

  // Getting the last value and using as references
  const dataArray = await device.find(referenceFilter).catch(err => context.log(err.message));
  if (!dataArray) return context.log('No data');
  const deviceName = await accountDevices.info(dataArray[0].origin).catch(err => context.log(err.message));
  const latitude = dataArray[0].value;
  const longitude = dataArray[1].value;
  const temperature = dataArray[2].value;
  const tilt = dataArray[3].value;
  const deviceBattery = dataArray[4].value;
  const lastStatus = dataArray[5];
  const pushNotifications = dataArray[6];


  // Inserting with current units
  const dataToInsert = await toTagoFormat({
    temperature: {
      value: temperature,
      unit: '°F',
    },
    battery: {
      value: deviceBattery,
      unit: '%',
    },
    assetLocation: {
      value: 0,
      location: {
        lat: latitude,
        lng: longitude,
      },
    },
  });
  await device.insert(dataToInsert).catch(error => context.log(error.message));

  await insertMaximumTilt(device, context);
  const data = {
    time,
    email,
    pushNotifications,
    dashboardId,
    deviceName,
    Notification,
    lastStatus,
    latitude,
    longitude,
  };
  await verifyPushNotification(data, device, context);
  await assetHistory(time, deviceName, email, tilt, temperature, device, context);
}

module.exports = new Analysis(myAnalysis, '1a48beaa-678b-4613-917f-f82f9c567747');
