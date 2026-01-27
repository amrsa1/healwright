export default class DataProvider {
  async generateRandomString(content: string) {
    const randomNumber = Math.floor(Math.random() * 90000000) + 10000000;
    switch (content) {
      case "title":
        return `Title: ${randomNumber}`;
      case "comment":
        return `This is a comment: ${randomNumber}`;
      default:
        throw new Error(`Unsupported content type: ${content}`);
    }
  }
}
