import chalk from "chalk";
import { exec, spawn, SpawnOptionsWithoutStdio } from "child_process";
import util from 'util';
import { readdirSync } from 'fs';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url); // get the resolved path to the file
const __dirname = dirname(__filename); // get the name of the directory

const execute = util.promisify(exec);
// location of project config file 
export const projectConfigPath = resolve(__dirname, '..', '..', '..', 'config', 'project-config.json');

// location where the env file will be created
export const envPath = resolve(__dirname, "..", 'packages', 'webapp', 'src', '.env');

// location of web app dist folder
export const webappDistPath = resolve(__dirname, "..", 'packages', 'webapp', 'dist');

// webapp assets path - static assets to be served 
export const webappStaticAssetsPath = resolve(__dirname, "..", 'packages', 'webapp', 'src', 'static');

// webapp hydrate folder path - hydration to data bucket
export const webappHydrateAssetsPath = resolve(__dirname, "..", 'packages', 'webapp', 'src', 'hydration');

// graphql codegen configs
export const graphQLConfigTemplate = resolve(__dirname, "..", 'packages', 'webapp', 'gql_config_template.yml')

export const graphQLConfigFilePath = resolve(__dirname, "..", 'packages', 'webapp', '.graphqlconfig.yml')

export const executeCommand = async (instr: string) => {
    try {
        const { stdout, stderr } = await execute(instr);
        if (stderr) {
            console.error(`exec error: ${JSON.stringify(stderr)}`);
            console.log(`stderr: ${stderr}`);
        }
        console.log(chalk.magenta(stdout));
        return stdout && stdout.length > 0 ? stdout.trim() : "success"
    } catch (err: any) {
        // console.info(err)
        console.log(chalk.yellow(`\n Error - ${JSON.stringify(err.stderr)}\n`));
    }
    return null;
}

export const spawnChild = (instr: string, args?: readonly string[], options?: SpawnOptionsWithoutStdio) => {
    return new Promise((resolve, reject) => {
        // nosemgrep: detect-child-process
        const child = spawn(instr, args, { ...options, shell: false });
        let stdoutData = '';
        let stderrData = '';
        // print command output
        child.stdout.on('data', (data) => {
            console.log(chalk.blue(`${data.toString()}`));
            stdoutData += data;
        });
        // this will print console errors identified
        child.stderr.on('data', (data) => {
            console.log(chalk.cyan(`${data.toString()}`));
            stderrData += data;
        });
        // Centralized error handling
        child.on('error', (err) => {
            console.error(`Child process error: ${err}`);
            reject(new Error(`Child process error: ${err}`));
        });
        child.on('close', (code, signal) => {
            const respPayload = JSON.stringify({
                "command": instr,
                "args": args,
                "options": options,
                "code": code,
                "signal": signal,
                "output": stdoutData,
                "error": stderrData
            })
            if (code !== 0) {
                const error = new Error(respPayload)
                reject(error);
            } else {
                resolve(respPayload);
            }
        });
    })
}


export function* readAllFiles(dir: string): Generator<string> {
    console.log("Reading files from directory:", dir)
    const files = readdirSync(dir, { withFileTypes: true });

    for (const file of files) {
        if (file.isDirectory()) {
            yield* readAllFiles(join(dir, file.name));
        } else {
            yield join(dir, file.name);
        }
    }
}