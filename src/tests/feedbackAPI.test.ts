import { expect, request } from "@playwright/test";
import configList from "../../configlist";
import { fixtures as test } from "../utils/fixture";

const req = request.newContext({
  baseURL: configList.apiBaseUrl,
  extraHTTPHeaders: {
    Authorization: `Bearer ${process.env.accessToken}`,
    "Content-Type": "application/json",
  },
});

test.describe("Feedback API test suite", () => {
  test("[API] Should return status code 200 when submitting feedback with valid entry", async ({
    api,
    dataProvider,
  }) => {
    const title = await dataProvider.generateRandomString("title");
    const body = await dataProvider.generateRandomString("comment");

    await api.getUsers();
    const randomUserId = await api.randomUserIdExcluding("amrka");

    await (
      await req
    )
      .post("/feedback", {
        data: {
          body: body,
          receiverId: randomUserId.id,
          title: title,
        },
      })
      .then(async (res) => {
        const responseBody = await res.json();
        expect(res.status()).toBe(200);
        expect.soft(responseBody.title).toBe(title);
        expect.soft(responseBody.body).toBe(body);
      });
  });

  test("[API] Should return 403 when user submits feedback to him/herself", async ({ dataProvider }) => {
    const title = await dataProvider.generateRandomString("title");
    const body = await dataProvider.generateRandomString("comment");

    await (
      await req
    )
      .post("/feedback", {
        data: {
          body: body,
          receiverId: 1,
          title: title,
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(403);
      });
  });

  test("[API] Should return 400 when submitting feedback without body", async ({ api, dataProvider }) => {
    const title = await dataProvider.generateRandomString("title");
    await api.getUsers();
    const randomUserId = await api.randomUserIdExcluding("amrka");

    await (
      await req
    )
      .post("/feedback", {
        data: {
          receiverId: randomUserId.id,
          title: title,
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(400);
      });
  });

  test("[API] Should return 400 when submitting feedback without title", async ({ api, dataProvider }) => {
    const body = await dataProvider.generateRandomString("comment");
    await api.getUsers();
    const randomUserId = await api.randomUserIdExcluding("amrka");

    await (
      await req
    )
      .post("/feedback", {
        data: {
          body: body,
          receiverId: randomUserId.id,
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(400);
      });
  });

  test("[API] Should return 400 when submitting feedback without receiverId", async ({ dataProvider }) => {
    const body = await dataProvider.generateRandomString("comment");
    const title = await dataProvider.generateRandomString("title");

    await (
      await req
    )
      .post("/feedback", {
        data: {
          body: body,
          title: title,
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(400);
      });
  });

  // New tests for edit and delete functionality
  test("[API] Should return 200 when updating own feedback with valid entry", async ({ api, dataProvider }) => {
    // First create a feedback
    const title = await dataProvider.generateRandomString("title");
    const body = await dataProvider.generateRandomString("comment");
    const newTitle = await dataProvider.generateRandomString("updated-title");
    const newBody = await dataProvider.generateRandomString("updated-comment");
    
    await api.getUsers();
    const randomUserId = await api.randomUserIdExcluding("amrka");
    
    // Create feedback
    const createResponse = await (await req).post("/feedback", {
      data: {
        body: body,
        receiverId: randomUserId.id,
        title: title,
      },
    });
    
    const createdFeedback = await createResponse.json();
    expect(createResponse.status()).toBe(200);
    
    // Update feedback
    await (await req)
      .put(`/feedback/${createdFeedback.id}`, {
        data: {
          title: newTitle,
          body: newBody,
        },
      })
      .then(async (res) => {
        const responseBody = await res.json();
        expect(res.status()).toBe(200);
        expect.soft(responseBody.title).toBe(newTitle);
        expect.soft(responseBody.body).toBe(newBody);
      });
  });
  
  test("[API] Should return 404 when updating non-existent feedback", async ({ dataProvider }) => {
    const title = await dataProvider.generateRandomString("updated-title");
    const body = await dataProvider.generateRandomString("updated-comment");
    
    await (await req)
      .put(`/feedback/99999`, { // Non-existent ID
        data: {
          title: title,
          body: body,
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(404);
      });
  });
  
  test("[API] Should return 204 when deleting own feedback", async ({ api, dataProvider }) => {
    // First create a feedback
    const title = await dataProvider.generateRandomString("title");
    const body = await dataProvider.generateRandomString("comment");
    
    await api.getUsers();
    const randomUserId = await api.randomUserIdExcluding("amrka");
    
    // Create feedback
    const createResponse = await (await req).post("/feedback", {
      data: {
        body: body,
        receiverId: randomUserId.id,
        title: title,
      },
    });
    
    const createdFeedback = await createResponse.json();
    expect(createResponse.status()).toBe(200);
    
    // Delete feedback
    await (await req)
      .delete(`/feedback/${createdFeedback.id}`)
      .then(async (res) => {
        expect(res.status()).toBe(204);
      });
    
    // Verify it's deleted by trying to update it
    await (await req)
      .put(`/feedback/${createdFeedback.id}`, {
        data: {
          title: "Should fail",
          body: "This feedback has been deleted",
        },
      })
      .then(async (res) => {
        expect(res.status()).toBe(404);
      });
  });
  
  test("[API] Should return 404 when deleting non-existent feedback", async () => {
    await (await req)
      .delete(`/feedback/99999`) // Non-existent ID
      .then(async (res) => {
        expect(res.status()).toBe(404);
      });
  });
});
