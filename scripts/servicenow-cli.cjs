const {existsSync} = require('node:fs');
const {dirname, join} = require('node:path');
const {spawnSync} = require('node:child_process');
const https = require('node:https');

if (require.main === module) {
	const cliDirectory = join(process.env.ProgramFiles || 'C:\\Program Files', 'ServiceNow CLI', 'bin');
	const installedCli = join(cliDirectory, 'snc.exe');
	const result = spawnSync(existsSync(installedCli) ? installedCli : 'snc', process.argv.slice(2), {
		stdio: 'inherit',
		env: {
			...process.env,
			PATH: [dirname(process.execPath), cliDirectory, process.env.PATH].join(require('node:path').delimiter),
			NODE_OPTIONS: `${process.env.NODE_OPTIONS || ''} --require "${__filename.replace(/\\/g, '/')}"`.trim()
		}
	});
	if (result.error) console.error(result.error.message);
	process.exitCode = result.status === null ? 1 : result.status;
} else {
	const originalRequest = https.request;
	https.request = function (...args) {
		const first = args[0];
		const hasUrl = first instanceof URL || typeof first === 'string';
		const url = hasUrl ? new URL(first) : null;
		const options = hasUrl ? (typeof args[1] === 'object' ? args[1] : {}) : first;
		const method = String(options.method || 'GET').toUpperCase();
		const hostname = options.hostname || options.host || (url && url.hostname);
		const path = String(options.path || options.pathname || (url && url.pathname) || '').split('?')[0];
		const stripBody = method === 'GET' && hostname === 'servicenow.terra-aws.com'
			&& path.startsWith('/api/now/table/');

		if (!stripBody) return originalRequest.apply(this, args);

		const cleanOptions = {...options, headers: {...options.headers}};
		for (const name of Object.keys(cleanOptions.headers)) {
			if (['content-length', 'transfer-encoding'].includes(name.toLowerCase())) {
				delete cleanOptions.headers[name];
			}
		}
		if (!hasUrl) args[0] = cleanOptions;
		else if (typeof args[1] === 'object') args[1] = cleanOptions;
		else args.splice(1, 0, cleanOptions);

		const request = originalRequest.apply(this, args);
		const originalEnd = request.end;
		request.write = function (chunk, encoding, callback) {
			const done = typeof encoding === 'function' ? encoding : callback;
			if (typeof done === 'function') process.nextTick(done);
			return true;
		};
		request.end = function (...values) {
			const callback = values.find(value => typeof value === 'function');
			return callback ? originalEnd.call(this, callback) : originalEnd.call(this);
		};
		return request;
	};
}