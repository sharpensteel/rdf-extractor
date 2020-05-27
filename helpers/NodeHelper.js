const { exec } = require("child_process");


/**
 * @param {string} cmd
 * @return {Promise}
 */
exports.execPromisified = function execPromisified(cmd){
    return new Promise((resolve, reject) => exec(cmd, (error, stdout, stderr) => {
        if (error) {
            reject(error);
            return;
        }
        if (stderr) {
            reject(error);
            return;
        }
        resolve(stdout);
    }));
}