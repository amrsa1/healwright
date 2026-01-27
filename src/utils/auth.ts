import { request } from "playwright-core";
import configList from "../../configlist";

const qaWorldAuth = request.newContext({
  baseURL: configList.apiBaseUrl,
  extraHTTPHeaders: {
    "Content-Type": "application/json",
  },
});

const setEnv = (name: string, value: string) => (process.env[name] = value);
async function login() {
  await (
    await qaWorldAuth
  )
    .post(`/auth/sign-in`, {
      data: {
        username: process.env.BASIC_USERNAME,
        password: process.env.BASIC_PASSWORD,
      },
    })
    .then(async (res) => {
      try {
        const accessToken = (await res.json()).accessToken;
        setEnv("accessToken", accessToken);
        console.log(
          "\x1b[32m" +
          `
 ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 ┃                                                      ┃
 ┃   √ Access token has been successfully obtained!     ┃
 ┃                                                      ┃
 ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
` +
          "\x1b[0m"
        );
      } catch (error) {
        console.log(
          "\x1b[31m" +
          `
 ┏━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┓
 ┃                                                      ┃
 ┃   X Failed to obtain the access token                ┃
 ┃                                                      ┃
 ┗━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━┛
` +
          "\x1b[0m"
        );
        console.error(error);
        process.exitCode = 1;
      }
    });
}

export default login;
