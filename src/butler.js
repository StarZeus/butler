// Add dependencies
const dockerHealthCheckServer = require('fastify')({ logger: false });
const restServer = require('fastify')({ logger: true });
const AutoLoad = require('fastify-autoload');
const FastifySwagger = require('fastify-swagger');
const FastifyHealthcheck = require('fastify-healthcheck');
const path = require('path');

// Load code from sub modules
const globals = require('./globals');
const mqtt = require('./mqtt');
const udp = require('./udp');
const heartbeat = require('./lib/heartbeat');
const scheduler = require('./lib/scheduler');
const serviceUptime = require('./lib/service_uptime');
const telemetry = require('./lib/telemetry');

// Set up connection to Influxdb (if enabled)
globals.initInfluxDB();

if (
    (globals.config.has('Butler.uptimeMonitor.enabled') &&
        globals.config.get('Butler.uptimeMonitor.enabled') === true) ||
    (globals.config.has('Butler.uptimeMonitor.enable') &&
        globals.config.get('Butler.uptimeMonitor.enable') === true)
) {
    serviceUptime.serviceUptimeStart();
}

async function mainScript() {
    // Load certificates to use when connecting to healthcheck API
    const certFile = path.resolve(__dirname, globals.config.get('Butler.cert.clientCert'));
    const keyFile = path.resolve(__dirname, globals.config.get('Butler.cert.clientCertKey'));
    const caFile = path.resolve(__dirname, globals.config.get('Butler.cert.clientCertCA'));

    // Set up heartbeats, if enabled in the config file
    if (
        (globals.config.has('Butler.heartbeat.enabled') &&
            globals.config.get('Butler.heartbeat.enabled') === true) ||
        (globals.config.has('Butler.heartbeat.enable') &&
            globals.config.get('Butler.heartbeat.enable') === true)
    ) {
        heartbeat.setupHeartbeatTimer(globals.config, globals.logger);
    }

    try {
        // Get host info
        globals.hostInfo = await globals.initHostInfo();
        globals.logger.debug('CONFIG: Initiated host info data structures');

        globals.logger.info('--------------------------------------');
        globals.logger.info('Starting Butler');
        globals.logger.info(`Log level      : ${globals.getLoggingLevel()}`);
        globals.logger.info(`App version    : ${globals.appVersion}`);
        globals.logger.info(`Instance ID    : ${globals.hostInfo.id}`);
        globals.logger.info('');
        globals.logger.info(`Node version   : ${globals.hostInfo.node.nodeVersion}`);
        globals.logger.info(`Architecture   : ${globals.hostInfo.si.os.arch}`);
        globals.logger.info(`Platform       : ${globals.hostInfo.si.os.platform}`);
        globals.logger.info(`Release        : ${globals.hostInfo.si.os.release}`);
        globals.logger.info(`Distro         : ${globals.hostInfo.si.os.distro}`);
        globals.logger.info(`Codename       : ${globals.hostInfo.si.os.codename}`);
        globals.logger.info(`Virtual        : ${globals.hostInfo.si.system.virtual}`);
        globals.logger.info(`Processors     : ${globals.hostInfo.si.cpu.processors}`);
        globals.logger.info(`Physical cores : ${globals.hostInfo.si.cpu.physicalCores}`);
        globals.logger.info(`Cores          : ${globals.hostInfo.si.cpu.cores}`);
        globals.logger.info(`Docker arch.   : ${globals.hostInfo.si.cpu.hypervizor}`);
        globals.logger.info(`Total memory   : ${globals.hostInfo.si.memory.total}`);
        globals.logger.info('--------------------------------------');

        // Log info about what Qlik Sense certificates are being used
        globals.logger.info(`Client cert: ${certFile}`);
        globals.logger.info(`Client cert key: ${keyFile}`);
        globals.logger.info(`CA cert: ${caFile}`);

        // Set up anon telemetry reports, if enabled
        if (
            globals.config.has('Butler.anonTelemetry') === false ||
            (globals.config.has('Butler.anonTelemetry') === true &&
                globals.config.get('Butler.anonTelemetry') === true)
        ) {
            telemetry.setupAnonUsageReportTimer();
            globals.logger.verbose('MAIN: Anonymous telemetry reporting has been set up.');
        }
    } catch (err) {
        globals.logger.error(`CONFIG: Error initiating host info: ${err}`);
    }

    restServer.register(FastifySwagger, {
        routePrefix: '/documentation',
        swagger: {
            mode: 'dynamic',
            info: {
                title: 'Butler API documentation',
                description:
                    'Butler is a microservice that provides add-on features to Qlik Sense Enterprise on Windows.\nButler offers both a REST API and things like failed reload notifications etc.\n\nThis page contains the API documentation. Full documentation is available at https://butler.ptarmiganlabs.com',
                version: globals.appVersion,
            },
            externalDocs: {
                url: 'https://github.com/ptarmiganlabs',
                description: 'Butler family of tools on GitHub',
            },
            produces: ['application/json'],
        },
        host: `${globals.config.get('Butler.restServerConfig.serverHost')}:${globals.config.get(
            'Butler.restServerConfig.serverPort'
        )}`,
        uiConfig: {
            docExpansion: 'full',
            deepLinking: true,
        },
        hideUntagged: false,
        exposeRoute: true,
    });

    // ---------------------------------------------------
    // Loads all plugins defined in routes
    restServer.register(AutoLoad, {
        dir: path.join(__dirname, 'routes'),
        // options: Object.assign({}, opts)
    });

    // restServer.pre(function (req, res, next) {
    //     // Is there a X-HTTP-Method-Override header?
    //     // If so, change the http method to the one specified

    //     for (const [key, value] of Object.entries(req.headers)) {
    //         if (key.toLowerCase() == 'x-http-method-override') {
    //             req.method = value;
    //         }
    //     }

    //     req.headers.accept = 'application/json';
    //     return next();
    // });

    // ---------------------------------------------------
    // Set up MQTT
    if (globals.config.get('Butler.mqttConfig.enable')) {
        mqtt.mqtt.mqttInitHandlers();
    }

    // ---------------------------------------------------
    // Set up UDP handlers
    if (globals.config.get('Butler.udpServerConfig.enable')) {
        udp.udp.udpInitTaskErrorServer();
        udp.udp.udpInitSessionConnectionServer();

        globals.logger.debug(`Server for UDP server: ${globals.udpHost}`);

        // Start UDP server for Session and Connection events
        globals.udpServerSessionConnectionSocket.bind(
            globals.udpPortSessionConnection,
            globals.udpHost
        );

        // Start UDP server for failed task events
        globals.udpServerTaskFailureSocket.bind(globals.udpPortTakeFailure, globals.udpHost);
    }

    // ---------------------------------------------------
    // Start REST server on port 8080
    if (globals.config.get('Butler.restServerConfig.enable')) {
        globals.logger.debug(
            `REST server host: ${globals.config.get('Butler.restServerConfig.serverHost')}`
        );
        globals.logger.debug(
            `REST server port: ${globals.config.get('Butler.restServerConfig.serverPort')}`
        );

        restServer.listen(
            globals.config.get('Butler.restServerConfig.serverPort'),
            globals.config.get('Butler.restServerConfig.serverHost'),
            (err, address) => {
                if (err) {
                    globals.logger.error(`MAIN: REST server could not listen on ${address}`);
                    restServer.log.error(err);
                    process.exit(1);
                }
                restServer.log.info(`server listening on ${address}`);
                globals.logger.info(`MAIN: REST server listening on ${address}`);

                restServer.ready((err2) => {
                    if (err2) throw err;
                    restServer.swagger();
                });
            }
        );
    }

    // Load already defined schedules
    if (globals.config.has('Butler.scheduler')) {
        if (globals.config.get('Butler.scheduler.enable') === true) {
            scheduler.loadSchedulesFromDisk();
            // scheduler.launchAllSchedules();
        } else {
            // eslint-disable-next-line quotes
            globals.logger.info("MAIN: Didn't load schedules from file");
        }
    }

    // Start Docker healthcheck REST server on port set in config file
    if (
        (globals.config.has('Butler.dockerHealthCheck.enabled') &&
            globals.config.get('Butler.dockerHealthCheck.enabled') === true) ||
        (globals.config.has('Butler.dockerHealthCheck.enable') &&
            globals.config.get('Butler.dockerHealthCheck.enable') === true)
    ) {
        try {
            globals.logger.verbose('MAIN: Starting Docker healthcheck server...');

            dockerHealthCheckServer.register(FastifyHealthcheck);
            await dockerHealthCheckServer.listen(
                globals.config.get('Butler.dockerHealthCheck.port')
            );

            globals.logger.info(
                `MAIN: Started Docker healthcheck server on port ${globals.config.get(
                    'Butler.dockerHealthCheck.port'
                )}.`
            );
        } catch (err) {
            globals.logger.error(
                `MAIN: Error while starting Docker healthcheck server on port ${globals.config.get(
                    'Butler.dockerHealthCheck.port'
                )}.`
            );
            dockerHealthCheckServer.log.error(err);
            process.exit(1);
        }
    }
}

mainScript();
