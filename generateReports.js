/* eslint-disable camelcase */
const Analysis = require('tago/analysis');
const Account = require('tago/account');
const Device = require('tago/device');
const Utils = require('tago/utils');
const Services = require('tago/services');
const moment = require('moment-timezone');

// This is going to be the header of our csv file
const header = 'DATE;TIME;LATITUDE;LONGITUDE;TEMPERATURE(°F);TILT(°);BATTERY(%)';

/**
 * Function to get period in desired format
 * @param {Object} period Object containing our start_date and end_date
 */
function formateDate(period) {
  return {
    start_date: moment(new Date(period.metadata.start_date).toISOString()).tz('America/Sao_Paulo').format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]'),
    end_date: moment(new Date(period.metadata.end_date).toISOString()).tz('America/Sao_Paulo').format('YYYY-MM-DD[T]HH:mm:ss.SSS[Z]'),
  };
}

/**
 * Function to get all the data within the period
 * @param {Object} assetDevice Object used as our device
 * @param {String} start_date Period start date
 * @param {String} end_date Period end date
 */
async function getAssetDataOfPeriod(assetDevice, start_date, end_date) {
  const variables = ['assetlocation', 'temperature', 'tilt', 'battery'];
  const assetdata = await assetDevice.find({
    variables,
    start_date,
    end_date,
    qty: 20,
  });
  return assetdata;
}

/**
 * Function where csv file will be created ("\n" is a new line and ";" means a new column)
 * @param {Object} assetData Object containing all data
 * @param {Object} reports Object containg which variables will be reported
 */
function createCSV(assetData, reports) {
  let csv = `${header}`;
  assetData.forEach((data) => {
    if (data.variable === 'assetlocation') {
      const date = moment.utc(data.time).format('MM/DD/YYYY');
      const hour = moment.utc(data.time).format('HH:mm:ss');
      const series = assetData.filter(x => x.time === data.time);
      const notReported = '';

      const location = series.find(x => x.variable === 'assetlocation');
      const temperature = series.find(x => x.variable === 'temperature');
      const tilt = series.find(x => x.variable === 'tilt');
      const battery = series.find(x => x.variable === 'battery');
      csv = `${csv}\n${date};${hour};`;

      if (reports.location === 0 || !location) {
        csv = `${csv}${notReported};`;
      } else {
        csv = `${csv}${location.location.coordinates[1]};${location.location.coordinates[0]};`;
      }

      if (reports.temperature === 0 || !temperature) {
        csv = `${csv}${notReported};`;
      } else {
        csv = `${csv}${temperature.value};`;
      }

      if (reports.tilt === 0 || !tilt) {
        csv = `${csv}${notReported};`;
      } else {
        csv = `${csv}${tilt.value};`;
      }

      if (reports.battery === 0 || !battery) {
        csv = `${csv}${notReported};`;
      } else {
        csv = `${csv}${battery.value};`;
      }
    }
  });
  return csv;
}

/**
 * Function where CSV file will be uploaded to Tago
 * @param {Object} account Account object
 * @param {String} csvstring CSV created previously by function createCSV
 */
async function uploadFileToTago(account, csvstring) {
  const accountInfo = await account.info();
  const fileId = Date.now();
  const csvbase64 = Buffer.from(csvstring).toString('base64');

  const filename = `Report/${fileId}_${moment().tz('America/Sao_Paulo').format('DD_MM_YYYY_HH_mm_ss')}.csv`;
  await account.files.uploadBase64([{
    filename,
    file: csvbase64,
    public: true,
  }]);
  const fileUrl = `https://api.tago.io/file/${accountInfo.id}/${filename}`;
  return fileUrl;
}

/**
 * Function to store variable that contains report url, you can use this variable in other cases
 * @param {Object} context Context Object
 * @param {Object} assetDevice Our device object
 * @param {String} start_date Period start date
 * @param {String} end_date Period end date
 * @param {String} fileurl CSV file URL
 */
async function formValidation(context, assetDevice, type, message) {
  const datatotago = {
    variable: 'report_validation',
    value: message,
    metadata: {
      type,
    },
  };
  await assetDevice.insert(datatotago).then(context.log);
}

async function linkReportToTable(context, device, fileurl) {
  const datatotago = {
    variable: 'report_link',
    value: 'Download Report',
    metadata: {
      url: fileurl,
    },
  };
  await device.insert(datatotago).catch(err => context.log(err.message));
}

/**
 * Main function
 * @param {Context} context Context object
 * @param {Scope} scope Scope object
 */
// eslint-disable-next-line consistent-return
async function myAnalysis(context, scope) {
  const envVars = Utils.env_to_obj(context.environment);
  if (!envVars.device_token) return context.log('Missing device_token environment variable');
  if (!envVars.account_token) return context.log('Missing account_token environment variable');
  const account = new Account(envVars.account_token);
  const Email = new Services(context.token).email;

  // Period used in report
  const period = scope.find(x => x.variable === 'report_period');
  if (!period) {
    return context.log('Period not inserted!');
  }

  const token = await Utils.getTokenByName(account, period.origin);
  const assetDevice = new Device(token);


  // Looking for variables in our context to check what the user wants in report
  const reportBattery = scope.find(x => x.variable === 'report_battery');
  const reportTemperature = scope.find(x => x.variable === 'report_temperature');
  const reportTilt = scope.find(x => x.variable === 'report_tilt');
  const reportLocation = scope.find(x => x.variable === 'report_location');
  const email = scope.find(x => x.variable === 'report_email');

  const reports = {
    battery: reportBattery.value,
    temperature: reportTemperature.value,
    tilt: reportTilt.value,
    location: reportLocation.value,
  };

  const {
    start_date,
    end_date,
  } = formateDate(period);

  const assetData = await getAssetDataOfPeriod(assetDevice, start_date, end_date);
  if (!assetData) return formValidation(context, assetDevice, 'danger', 'No data available!');
  const csvstring = createCSV(assetData, reports);
  const fileurl = await uploadFileToTago(account, csvstring);

  // If user inserted an email, a link to download the csv file will be sent to his email
  if (email.value) {
    const subject = 'Asset Tracking Report';
    const message = `Please click on the link bellow to download asset report:\n${fileurl}`;
    Email.send(email.value, subject, message).then(context.log('Email sent!')).catch(err => context.log(err.message));
  }

  await formValidation(context, assetDevice, 'success', 'Report generated!');
  await linkReportToTable(context, assetDevice, fileurl);
}

module.exports = new Analysis(myAnalysis, '3d36d77a-8572-4b5e-a31e-ffbe3dcaa663');
