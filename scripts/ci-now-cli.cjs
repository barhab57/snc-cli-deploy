// Runs @servicenow/cli directly (no snc binary or keychain profile) for CI.
const {spawnSync} = require('node:child_process');
const {join} = require('node:path');

const CREDENTIAL_VARS = ['SN_HOST', 'SN_USERNAME', 'SN_PASSWORD'];

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
	const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
		stdio: 'inherit',
		env: {
			...process.env,
			NOW_CLI_ENTRY: cli,
			NODE_OPTIONS: [process.env.NODE_OPTIONS, preload('servicenow-cli.cjs'), preload('ci-now-cli.cjs')]
				.filter(Boolean).join(' ')
		}
	});
	if (result.error) console.error(result.error.message);
	process.exitCode = result.status === null ? 1 : result.status;
} else if (process.argv[1] === process.env.NOW_CLI_ENTRY) {
	// Injected in-process so the password never appears on a command line.
	process.argv.push(
		'--loginHost', process.env.SN_HOST,
		'--username', process.env.SN_USERNAME,
		'--password', process.env.SN_PASSWORD
	);
}
