import { request } from "playwright-core";
import configList from "../../configlist";

const usersList: Array<object> | any = [];

const req = request.newContext({
  baseURL: configList.apiBaseUrl,
  extraHTTPHeaders: {
    Authorization: `Bearer ${process.env.accessToken}`,
    "Content-Type": "application/json",
  }
});

export default class API {
  async getUsers() {
    const users = await (await (await req).get("/auth/users/")).json();
    usersList.push(...users);
  }

  async randomUserIdExcluding(username: string) {
    const filteredArr = usersList.filter((obj: { username: string }) => obj.username !== username);
    const randomIndex = Math.floor(Math.random() * filteredArr.length);
    const randomUserId = filteredArr[randomIndex];
    return randomUserId;
  }
}
