const globals = require('../globals');
const { sendEmailBasic } = require('./smtp');

function sendTestEmail(emailAddress) {
    try {
        sendEmailBasic(
            'noreply',
            [emailAddress],
            'normal',
            'Test email from Butler for Qlik Sense',
            "This is a test email sent from your friendly Butler for Qlik Sense Enterprise on Windows.\n\nIf you get this email Butler's email configuration is correct and working."
        );
    } catch (err) {
        globals.logger.error(`TEST EMAIL: ${err}`);
    }
}

module.exports = {
    sendTestEmail,
};