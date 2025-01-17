const path = require('path');
const QrsInteract = require('qrs-interact');

const globals = require('../globals');

/**
 *
 * @param {*} taskId
 * @returns
 */
function getTaskTags(taskId) {
    return new Promise(async (resolve, reject) => {
        globals.logger.debug(`GETTASKTAGS: Retrieving all tags of reload task ${taskId}`);

        try {
            const qrsInstance = new QrsInteract({
                hostname: globals.configQRS.host,
                portNumber: globals.configQRS.port,
                headers: {
                    'X-Qlik-User': 'UserDirectory=Internal; UserId=sa_repository',
                },
                certificates: {
                    certFile: path.resolve(globals.configQRS.certPaths.certPath),
                    keyFile: path.resolve(globals.configQRS.certPaths.keyPath),
                },
            });

            // Get info about the task
            try {
                globals.logger.debug(`GETTASKTAGS: task/full?filter=id eq ${taskId}`);

                const result = await qrsInstance.Get(`task/full?filter=id eq ${taskId}`);
                globals.logger.debug(`GETTASKTAGS: Got response: ${result.statusCode}`);

                if (result.body.length === 1) {
                    // Yes, the task exists. Return all tags for this task

                    // Get array of all values for this CP, for this task
                    const taskTags1 = result.body[0].tags;

                    // Get array of all CP values
                    const taskTags2 = taskTags1.map((item) => item.name);

                    resolve(taskTags2);
                } else {
                    // The task does not exist
                    resolve([]);
                }
            } catch (err) {
                globals.logger.error(`GETTASKTAGS: Error while getting tags: ${err.message}`);
                resolve([]);
            }
        } catch (err) {
            globals.logger.error(`GETTASKTAGS: Error while getting tags: ${err}`);
            reject();
        }
    });
}

module.exports = {
    getTaskTags,
};
