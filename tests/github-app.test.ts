import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

test("GitHub App signs requests and reads only repository harness files", async () => {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  let server: Server | undefined;
  const requests: Array<{ method: string; url: string; authorization?: string }> = [];

  try {
    server = createServer((request, response) => {
      requests.push({
        method: request.method ?? "GET",
        url: request.url ?? "",
        ...(request.headers.authorization ? { authorization: request.headers.authorization } : {})
      });
      response.setHeader("Content-Type", "application/json");
      if (request.url === "/app/installations/42/access_tokens") {
        response.end(JSON.stringify({ token: "installation-token" }));
        return;
      }
      if (request.url === "/installation/repositories?per_page=100&page=1") {
        response.end(JSON.stringify({ repositories: [repositoryPayload()] }));
        return;
      }
      if (request.url === "/repos/acme/product") {
        response.end(JSON.stringify(repositoryPayload()));
        return;
      }
      if (request.url === "/repos/acme/product/commits/main") {
        response.end(JSON.stringify({ sha: "commit-sha", commit: { tree: { sha: "tree-sha" } } }));
        return;
      }
      if (request.url === "/repos/acme/product/git/commits/commit-sha" && request.method === "GET") {
        response.end(JSON.stringify({ tree: { sha: "base-tree" } }));
        return;
      }
      if (request.url === "/repos/acme/product/git/blobs" && request.method === "POST") {
        response.end(JSON.stringify({ sha: "proposal-blob" }));
        return;
      }
      if (request.url === "/repos/acme/product/git/trees" && request.method === "POST") {
        response.end(JSON.stringify({ sha: "proposal-tree" }));
        return;
      }
      if (request.url === "/repos/acme/product/git/commits" && request.method === "POST") {
        response.end(JSON.stringify({ sha: "proposal-commit" }));
        return;
      }
      if (request.url === "/repos/acme/product/git/refs" && request.method === "POST") {
        response.statusCode = 201;
        response.end(JSON.stringify({ ref: "refs/heads/harhub/bootstrap" }));
        return;
      }
      if (request.url === "/repos/acme/product/pulls" && request.method === "POST") {
        response.statusCode = 201;
        response.end(JSON.stringify({ number: 7, html_url: "https://github.com/acme/product/pull/7" }));
        return;
      }
      if (request.url === "/repos/acme/product/git/trees/tree-sha?recursive=1") {
        response.end(JSON.stringify({
          sha: "tree-sha",
          truncated: false,
          tree: [
            treeEntry(".agents/skills/research/SKILL.md", "skill-meta", 58),
            treeEntry(".agents/skills/research/references/checklist.md", "skill-ref", 10),
            treeEntry("AGENTS.md", "agents", 20),
            treeEntry("src/index.ts", "source", 100)
          ]
        }));
        return;
      }
      const blobs: Record<string, string> = {
        "skill-meta": "---\nname: research\ndescription: Research users.\n---\n# Research\n",
        "skill-ref": "checklist\n",
        agents: "# Agent instructions\n"
      };
      const blobMatch = request.url?.match(/\/git\/blobs\/(.+)$/);
      if (blobMatch && blobs[blobMatch[1]] !== undefined) {
        response.end(JSON.stringify({ encoding: "base64", content: Buffer.from(blobs[blobMatch[1]]).toString("base64") }));
        return;
      }
      response.statusCode = 404;
      response.end(JSON.stringify({ message: "Not found" }));
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const apiUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    process.env.HARHUB_GITHUB_APP_ID = "123";
    process.env.HARHUB_GITHUB_APP_SLUG = "harhub-test";
    process.env.HARHUB_GITHUB_APP_CLIENT_ID = "Iv1.test";
    process.env.HARHUB_GITHUB_APP_CLIENT_SECRET = "secret";
    process.env.HARHUB_GITHUB_APP_PRIVATE_KEY = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.HARHUB_GITHUB_API_URL = apiUrl;

    const {
      createGitHubAppJwt,
      createRepositoryPullRequest,
      listInstallationRepositories,
      readRepositoryInventorySource
    } = await import(`../src/server/services/github-app.js?test=${Date.now()}`);
    const jwt = createGitHubAppJwt(new Date("2026-07-22T00:00:00.000Z"));
    const [header, payload, signature] = jwt.split(".");
    assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString()), { alg: "RS256", typ: "JWT" });
    assert.equal(JSON.parse(Buffer.from(payload, "base64url").toString()).iss, "123");
    assert.equal(
      verify("RSA-SHA256", Buffer.from(`${header}.${payload}`), publicKey, Buffer.from(signature, "base64url")),
      true
    );

    const repositories = await listInstallationRepositories("42");
    assert.equal(repositories[0]?.fullName, "acme/product");
    const inventory = await readRepositoryInventorySource({
      installationId: "42",
      owner: "acme",
      name: "product"
    });
    assert.equal(inventory.commitSha, "commit-sha");
    assert.deepEqual(inventory.files.map((file) => file.path), [
      ".agents/skills/research/SKILL.md",
      ".agents/skills/research/references/checklist.md",
      "AGENTS.md"
    ]);
    assert.equal(requests.some((request) => request.url.includes("src/index.ts")), false);
    assert.ok(requests.some((request) => request.authorization?.startsWith("Bearer eyJ")));
    assert.ok(requests.some((request) => request.authorization === "Bearer installation-token"));
    const pull = await createRepositoryPullRequest({
      installationId: "42",
      owner: "acme",
      name: "product",
      defaultBranch: "main",
      baseSha: "commit-sha",
      branch: "harhub/bootstrap",
      title: "Configure Harhub",
      body: "Managed config",
      files: [{ path: ".harhub/project.json", status: "added", content: "{}\n" }]
    });
    assert.deepEqual(pull, { number: 7, url: "https://github.com/acme/product/pull/7" });
    assert.deepEqual(
      requests.filter((request) => request.method === "POST" && request.url.startsWith("/repos/acme/product"))
        .map((request) => request.url),
      [
        "/repos/acme/product/git/blobs",
        "/repos/acme/product/git/trees",
        "/repos/acme/product/git/commits",
        "/repos/acme/product/git/refs",
        "/repos/acme/product/pulls"
      ]
    );
  } finally {
    if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
    delete process.env.HARHUB_GITHUB_APP_ID;
    delete process.env.HARHUB_GITHUB_APP_SLUG;
    delete process.env.HARHUB_GITHUB_APP_CLIENT_ID;
    delete process.env.HARHUB_GITHUB_APP_CLIENT_SECRET;
    delete process.env.HARHUB_GITHUB_APP_PRIVATE_KEY;
    delete process.env.HARHUB_GITHUB_API_URL;
  }
});

function repositoryPayload() {
  return {
    id: 99,
    node_id: "R_99",
    name: "product",
    full_name: "acme/product",
    html_url: "https://github.com/acme/product",
    private: true,
    archived: false,
    default_branch: "main",
    description: "Product repository",
    owner: { login: "acme" },
    permissions: { admin: true, maintain: true, push: true, pull: true }
  };
}

function treeEntry(path: string, sha: string, size: number) {
  return { path, mode: "100644", type: "blob", sha, size, url: `https://api.github.test/blobs/${sha}` };
}
