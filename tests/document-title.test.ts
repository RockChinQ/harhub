import assert from "node:assert/strict";
import test from "node:test";

import {
  appPageTitle,
  formatDocumentTitle
} from "../src/web/src/app/document-title.js";

test("formats route and entity names as browser document titles", () => {
  assert.equal(formatDocumentTitle(), "Harhub");
  assert.equal(formatDocumentTitle(""), "Harhub");
  assert.equal(formatDocumentTitle("Harhub"), "Harhub");
  assert.equal(formatDocumentTitle("Skills"), "Skills · Harhub");
  assert.equal(
    formatDocumentTitle("Invoice Review · Project"),
    "Invoice Review · Project · Harhub"
  );
});

test("selects browser titles for every application route", () => {
  const authenticated = true;
  assert.equal(appPageTitle({ route: { view: "landing" }, authenticated }), undefined);
  assert.equal(appPageTitle({ route: { view: "assets" }, authenticated: false }), "Sign in");
  assert.equal(appPageTitle({
    route: { view: "assets" },
    authenticated: false,
    inviteToken: "invite"
  }), "Join Workspace");
  assert.equal(appPageTitle({ route: { view: "assets" }, authenticated }), "Skills");
  assert.equal(appPageTitle({
    route: { view: "asset-detail", assetQuery: "review-prep" },
    authenticated,
    assetName: "Review Prep"
  }), "Review Prep");
  assert.equal(appPageTitle({ route: { view: "projects" }, authenticated }), "Projects");
  assert.equal(appPageTitle({
    route: { view: "project-detail", projectId: "project-1" },
    authenticated
  }), "Project");
  assert.equal(appPageTitle({ route: { view: "forge" }, authenticated }), "Forge");
  assert.equal(appPageTitle({
    route: { view: "workspace" },
    authenticated,
    workspaceName: "Acme"
  }), "Acme · Workspace");
  assert.equal(appPageTitle({
    route: { view: "account" },
    authenticated,
    accountName: "Ada"
  }), "Ada · Account");
  assert.equal(appPageTitle({ route: { view: "device" }, authenticated }), "Authorize Device");
  assert.equal(appPageTitle({
    route: { view: "share", shareToken: "share" },
    authenticated: false
  }), "Shared Skill");
});
