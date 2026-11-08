// Runs @servicenow/cli directly (no snc binary or keychain profile) for CI.
const {spawnSync} = require('node:child_process');
const {mkdtempSync, writeFileSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {delimiter, join} = require('node:path');

const CREDENTIAL_VARS = ['SN_HOST', 'SN_USERNAME', 'SN_PASSWORD'];
const SNC_VERSION_JSON = '{"snc":"1.1.3"}';

// The CLI only runs `snc version --output json`; answer it without the real binary.
const createSncStub = () => {
	const dir = mkdtempSync(join(tmpdir(), 'snc-stub-'));
	writeFileSync(join(dir, 'snc'), `#!/bin/sh\necho '${SNC_VERSION_JSON}'\n`, {mode: 0o755});
	writeFileSync(join(dir, 'snc.cmd'), `@echo ${SNC_VERSION_JSON}\r\n`);
	return dir;
};

if (require.main === module) {
	const missing = CREDENTIAL_VARS.filter(name => !process.env[name]);
	if (missing.length) {
		console.error(`Missing environment variables: ${missing.join(', ')}`);
		process.exit(1);
	}

	const cli = require.resolve('@servicenow/cli/dist/servicenow-cli.min.js', {
		paths: [process.env.NOW_CLI_HOME || process.cwd()]
	});
	const preload = file => `--require "${join(__dirname, file).replace(/\\/g, '/')}"`;
	const pathKey = Object.keys(process.env).find(key => key.toUpperCase() === 'PATH') || 'PATH';
	const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
		stdio: ['inherit', 'pipe', 'pipe'],
		maxBuffer: 256 * 1024 * 1024,
		env: {
			...process.env,
			[pathKey]: [createSncStub(), process.env[pathKey]].join(delimiter),
			NOW_CLI_ENTRY: cli,
			NODE_OPTIONS: [process.env.NODE_OPTIONS, preload('servicenow-cli.cjs'), preload('ci-now-cli.cjs')]
				.filter(Boolean).join(' ')
		}
	});
	if (result.error) console.error(result.error.message);
	process.stdout.write(result.stdout || '');
	process.stderr.write(result.stderr || '');
	// The CLI logs deploy failures but still exits 0.
	const failed = /Failed to deploy|Unable to deploy/.test(`${result.stdout}${result.stderr}`);
	process.exitCode = result.status === null || failed ? 1 : result.status;
} else if (process.argv[1] === process.env.NOW_CLI_ENTRY) {
	// Injected in-process so the password never appears on a command line.
	process.argv.push(
		'--loginHost', process.env.SN_HOST,
		'--username', process.env.SN_USERNAME,
		'--password', process.env.SN_PASSWORD
	);
}
