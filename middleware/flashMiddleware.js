module.exports = (req, res, next) => {
    if (req.session) {
        res.locals.success_messages = req.session.success_messages || [];
        res.locals.error_messages = req.session.error_messages || [];
        delete req.session.success_messages;
        delete req.session.error_messages;
    } else {
        res.locals.success_messages = [];
        res.locals.error_messages = [];
    }

    req.flash = (type, message) => {
        if (!req.session) {
            console.warn("Flash message attempted without a session.");
            return;
        }
        const sessionKey = `${type}_messages`;
        if (!req.session[sessionKey]) {
            req.session[sessionKey] = [];
        }
        if (Array.isArray(message)) {
            message.forEach(msg => req.session[sessionKey].push(msg));
        } else {
            req.session[sessionKey].push(message);
        }
    };
    
    next();
};