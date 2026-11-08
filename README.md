@myorg/my-first-component
===============================================
My custom UI Builder component

## Deploy to ServiceNow

This component appears in UI Builder as **Incident Records**, with the custom
element name `x-1234-my-first-component` and application scope `x_1234_my_first`.

### Direct deployment

Node.js and the ServiceNow CLI must be installed. For the current Windows
installation, run this from PowerShell in the project folder:

```powershell
.\deploy.ps1
```

The script finds the local Node.js installation, then runs the package's deploy
command using the saved ServiceNow CLI profile `my-profile`.

The existing `my-profile` targets `https://servicenow.terra-aws.com`. Confirm the
target before deployment. Do not add `--force` unless you intend to overwrite
existing component records.

The installed CLI sends a body on Table API GET requests, which this instance's
CloudFront endpoint rejects with `403 Forbidden`. The deployment script preloads
`scripts/servicenow-cli.cjs` to remove GET bodies and their length headers only for
`https://servicenow.terra-aws.com/api/now/table/`. Authentication, write requests,
and other hosts are unchanged. No instance security changes are needed for this
workaround. Running `snc` directly does not activate it.

Do not put passwords or tokens in this repository or chat.

### CI/CD (GitHub Actions)

[.github/workflows/servicenow.yml](.github/workflows/servicenow.yml) builds every
pull request and deploys `main` to the instance. CI does not use the `snc`
binary: [scripts/ci-now-cli.cjs](scripts/ci-now-cli.cjs) runs the
`@servicenow/cli` npm package directly and passes credentials from environment
variables.

One-time setup in GitHub (**Settings > Environments > New environment** `dev`):

- Variable `SN_HOST`: `https://servicenow.terra-aws.com`
- Secret `SN_USERNAME` / `SN_PASSWORD`: a dedicated integration user, not a
  personal account

Pull requests upload the generated update set as the `update-set` artifact.
Bump `version` in `package.json` when a change should replace deployed assets.

### Import an update set instead

Generate an update set without connecting to the instance:

```powershell
npm.cmd run package:update-set
```

The XML is written to `.now-cli/`. Offline generation skips instance validation.
Have an authorized administrator test the import in a development instance:

1. Open **System Update Sets > Retrieved Update Sets** in ServiceNow.
2. Select **Import Update Set from XML** and upload the generated XML.
3. Open the imported update set and select **Preview Update Set**.
4. Resolve any preview errors, then select **Commit Update Set**.
5. Reload UI Builder, open a page, and search **Add content** for
	**Incident Records**.

Bind the component's `incidents` property to an array of incident records from a
UI Builder data resource. Without that binding, the component displays its empty
state. Importing an update set requires appropriate instance permissions.