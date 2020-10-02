/* eslint-disable no-unused-vars */

// Load global variables and functions
var globals = require('../globals');

// --------------------------------------------------------
// Set up UDP server handlers for acting on Sense failed task events
// --------------------------------------------------------
module.exports.udpInitTaskErrorServer = function () {
    // Handler for UDP server startup event
    globals.udpServerTaskFailureSocket.on('listening', function (message, remote) {
        var address = globals.udpServerTaskFailureSocket.address();

        globals.logger.info(`TASKFAILURE: UDP server listening on ${address.address}:${address.port}`);

        // Publish MQTT message that UDP server has started
        globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.taskFailureServerStatusTopic'), 'start');
    });

    // Handler for UDP error event
    globals.udpServerTaskFailureSocket.on('error', function (message, remote) {
        var address = globals.udpServerTaskFailureSocket.address();
        globals.logger.error(`TASKFAILURE: UDP server error on ${address.address}:${address.port}`);

        // Publish MQTT message that UDP server has reported an error
        globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.taskFailureServerStatusTopic'), 'error');
    });

    // Main handler for UDP messages relating to failed tasks
    globals.udpServerTaskFailureSocket.on('message', async function (message, remote) {
        try {
            var msg = message.toString().split(';');
            globals.logger.warn(`TASKFAILURE: ${msg[0]}: Task ${msg[1]} failed, associated with app ${msg[2]}`);

            // Post to Slack when a task has failed, if Slack is enabled
            if (globals.config.has('Butler.slackConfig.enable') && globals.config.get('Butler.slackConfig.enable') == true) {
                globals.slackObj.send({
                    text: 'Failed task: "' + msg[1] + '", linked to app "' + msg[2] + '".',
                    channel: globals.config.get('Butler.slackConfig.taskFailureChannel'),
                    username: msg[0],
                    icon_emoji: ':ghost:',
                });
            }

            // Post to MS Teams when a task has failed, if Teams is enabled
            if (globals.config.has('Butler.teamsConfig.enable') && globals.config.get('Butler.teamsConfig.enable') == true) {
                await globals.teamsTaskFailureObj.send(
                    JSON.stringify({
                        '@type': 'MessageCard',
                        '@context': 'https://schema.org/extensions',
                        summary: 'A reload task has failed in Qlik Sense',
                        themeColor: '0078D7',
                        title: `Failed task: ${msg[1]}, app name "${msg[2]}"`,
                        sections: [
                            {
                                // activityTitle: msg[2],
                                // activitySubtitle: msg[1],

                                text: 'Please refer to the QMC for further details',
                            },
                        ],
                    }),
                );
            }

            // Publish MQTT message when a task has failed, if MQTT enabled
            if (globals.config.has('Butler.mqttConfig.enable') && globals.config.get('Butler.mqttConfig.enable') == true) {
                globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.taskFailureTopic'), msg[1]);
            }
        } catch (err) {
            globals.logger.error('TASKFAILURE: Failed processing failed task event');
        }
    });
};

// --------------------------------------------------------
// Set up UDP server for acting on Sense session and connection events
// --------------------------------------------------------
module.exports.udpInitSessionConnectionServer = function () {
    // Handler for UDP server startup event
    //  globals.udpServerSessionConnectionSocket.on('listening', () => {
    globals.udpServerSessionConnectionSocket.on('listening', function (message, remote) {
        var address = globals.udpServerSessionConnectionSocket.address();

        globals.logger.info(`UDP server listening on ${address.address}:${address.port}`);

        // Publish MQTT message that UDP server has started
        globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.sessionServerStatusTopic'), 'start');
    });

    // Handler for UDP error event
    //  globals.udpServerSessionConnectionSocket.on('error', () => {
    globals.udpServerSessionConnectionSocket.on('error', function (message, remote) {
        var address = globals.udpServerSessionConnectionSocket.address();
        globals.logger.error(`UDP server error on ${address.address}:${address.port}`);

        // Publish MQTT message that UDP server has reported an error
        globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.sessionServerStatusTopic'), 'error');
    });

    // Main handler for UDP messages relating to session and connection events
    globals.udpServerSessionConnectionSocket.on('message', function (message, remote) {
        var msg = message.toString().split(';');
        globals.logger.info(`${msg[0]}: ${msg[1]} for user ${msg[2]}/${msg[3]}`);

        // Send Slack message when session starts/stops, or a connection open/close
        globals.slackObj.send({
            text: msg[1] + ' for user ' + msg[2] + '/' + msg[3],
            channel: globals.config.get('Butler.slackConfig.loginNotificationChannel'),
            username: msg[0],
            icon_emoji: '',
        });

        // Handle session events
        if (msg[1] == 'Start session') {
            globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.sessionStartTopic'), msg[0] + ': ' + msg[2] + '/' + msg[3]);
        }

        if (msg[1] == 'Stop session') {
            globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.sessionStopTopic'), msg[0] + ': ' + msg[2] + '/' + msg[3]);
        }

        // Handle connection events
        if (msg[1] == 'Open connection') {
            globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.connectionOpenTopic'), msg[0] + ': ' + msg[2] + '/' + msg[3]);
        }

        if (msg[1] == 'Close connection') {
            globals.mqttClient.publish(globals.config.get('Butler.mqttConfig.connectionCloseTopic'), msg[0] + ': ' + msg[2] + '/' + msg[3]);
        }
    });
};
