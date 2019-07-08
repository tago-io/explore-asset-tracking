# Tago Asset Tracking

This documentation will help you implement the Asset Tracking application. If you haven't seen this application yet click here(ASSET TRACKING EXAMPLE IN EXPLORE WILL BE LINKED HERE). But, if you have already seen and are interested in using this application to your own solution, read this documentation carefully and by the end of it you will have a working asset tracking in your Tago account.

## Asset Tracking requirements
To implement this application you need some items already working in your Tago account. If you do not have some item in the following list, please set this item up and get back to this doc. Check the list bellow:

- Device with geolocation already configured and bucket also created on TagoIO platform 🌎
- Basic programming knowledge and willingness to learn :rocket:

Short list isn't it? This application seems complicated but it's not that much! Now, let's begin the implementation. In just some minutes, everything will be up and running in your TagoIO account! First things first, let's divide the implementation in some steps:

- Dashboard duplication
- Analysis creation
- Action creation
- Report configuration

Let's follow up the list in that order so, starting with the dashboard duplication.

## Dashboard Duplication
In the explore option in Tago sidebar, you will see the Asset Tracking example, click in the 'Get this Dashboard' button. When you do this, the asset tracking dashboard will go into your account and a request to associate your devices will appear like the image bellow:

![device-association.png](https://i.postimg.cc/5tDx5g7C/Screenshot-2019-07-08-Dashboard-Asset-Tracking-2.png)

Just type in the name of the device you want to use in your asset tracking application (you can use more than one, but to start you need to choose one in the association process). After that, all the widgets will already be using the correct device and ready to receive your data!

## Analysis creation
To setup this application you need to create two analysis: assetLocation and generateReports analysis. Let's start with assetLocation. In your account, add an analysis with your name preference and configure the environment variables with your account's token, device's token and dashboard's ID. You should fill in the environment variables as follows:

![environment-Variables.png](https://i.postimg.cc/3NwbdFKy/environment-Variables.png)

Now there's only one thing missing, the code! Copy the code from the assetLocation.js script here in Github and paste it in your analysis, save it and it's done! Now, follow the same process to the generateReports analysis:
- Add a new analysis and name it as you want.
- Type your account and device tokens in the environment variables.
- Copy the code from generateReport.js script here in Github and paste it in your analysis.

Remember to enter the correct variable names in the environment variables settings:

![environmentVariables.png](https://i.postimg.cc/X7qYbM0W/variable-Reports.png)

With everything done, you should have the analyzes working. Now, let's create an action to run our assetLocation analysis.

## Action creation
To create this action, it's simple, click to add an action. In the following page, choose the option "Run Analysis" in the "Action to be taken" field and type your action name. Now, select your asset location analysis in the option "Run the Analysis". Now go to the Trigger tab and select the variable "location" or whatever you are using to send asset location to TagoIO platform, select "any" in "Condition" field and don't forget to disable the option "Lock trigger after action is taken". You should have it like this:

![actionTrigger.png](https://i.postimg.cc/bwfWRbg5/Screenshot-2019-07-08-Action-Run-Insertion-with-correct-locati.png)

Ok, if your action is like the action from image above, save it! Now your asset location analysis will run every time data location arrives in your Tago account.

## Report configuration
Now that you already created all necessary analyses and actions. You should also set the input form widget in Report tab to run your analysis to generate reports. To do it just click to edit this widget, go to User Control configurations and select the analysis you created to generate reports in the field "Run analysis when submitting form". After that, you'll already be able to generate reports through the dashboard.
