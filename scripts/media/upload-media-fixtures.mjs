#!/usr/bin/env node

import { createClient } from "@supabase/supabase-js";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { loadAndVerifyFixtures, sha256 } from "./media-fixtures.mjs";

export const REQUIRED_UPLOAD_CONFIRMATION = "UPLOAD PRODUCTION MEDIA FIXTURES";
export const KATBOSE_PRODUCTION_SUPABASE_PROJECT_REF = "ersangtaqrggqldfdbxq";
export const KATBOSE_PRODUCTION_SUPABASE_URL = `https://${KATBOSE_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co/`;

export function requireConfiguration(environment) {
  if (environment.MEDIA_FIXTURE_UPLOAD_CONFIRMATION !== REQUIRED_UPLOAD_CONFIRMATION) {
    throw new Error(`Set MEDIA_FIXTURE_UPLOAD_CONFIRMATION to ${REQUIRED_UPLOAD_CONFIRMATION}.`);
  }

  if (environment.KATBOSE_SUPABASE_PROJECT_REF !== KATBOSE_PRODUCTION_SUPABASE_PROJECT_REF) {
    throw new Error("Supabase production project reference mismatch.");
  }

  const url = environment.SUPABASE_URL;
  if (!url) {
    throw new Error("Protected Supabase upload URL is unavailable.");
  }

  let endpoint;
  try {
    endpoint = new URL(url);
  } catch {
    throw new Error("Invalid Supabase production URL.");
  }

  if (
    endpoint.protocol !== "https:" ||
    endpoint.hostname !== `${KATBOSE_PRODUCTION_SUPABASE_PROJECT_REF}.supabase.co` ||
    endpoint.port !== "" ||
    endpoint.username !== "" ||
    endpoint.password !== "" ||
    endpoint.pathname !== "/" ||
    endpoint.search !== "" ||
    endpoint.hash !== ""
  ) {
    throw new Error("Supabase URL is not the canonical production project root.");
  }

  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("Protected Supabase service-role configuration is unavailable.");
  }

  return { url: KATBOSE_PRODUCTION_SUPABASE_URL, serviceRoleKey };
}

async function objectExists(bucket, objectKey) {
  const segments = objectKey.split("/");
  const filename = segments.pop();
  const folder = segments.join("/");
  const { data, error } = await bucket.list(folder, {
    limit: 100,
    search: filename,
    sortBy: { column: "name", order: "asc" },
  });
  if (error) throw new Error(`Unable to inspect ${objectKey}: ${error.message}`);
  return data.some((entry) => entry.name === filename);
}

async function verifyExistingObject(bucket, fixture) {
  const { data, error } = await bucket.download(fixture.descriptor.objectKey);
  if (error) {
    throw new Error(`Unable to verify existing ${fixture.descriptor.objectKey}: ${error.message}`);
  }

  const body = new Uint8Array(await data.arrayBuffer());
  if (body.byteLength !== fixture.descriptor.bytes || sha256(body) !== fixture.descriptor.sha256) {
    throw new Error(
      `Existing ${fixture.descriptor.objectKey} does not match the committed fixture; refusing to overwrite it.`,
    );
  }
}

export async function uploadFixtures(environment = process.env) {
  const { url, serviceRoleKey } = requireConfiguration(environment);
  const { fixtures } = await loadAndVerifyFixtures();
  const supabase = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const bucket = supabase.storage.from("media");

  for (const fixture of Object.values(fixtures)) {
    if (await objectExists(bucket, fixture.descriptor.objectKey)) {
      await verifyExistingObject(bucket, fixture);
      process.stdout.write(
        `already exact ${fixture.descriptor.objectKey}: sha256=${fixture.descriptor.sha256}\n`,
      );
      continue;
    }

    const { data, error } = await supabase.storage
      .from("media")
      .upload(fixture.descriptor.objectKey, fixture.body, {
        contentType: "image/png",
        cacheControl: "31536000",
        upsert: false,
      });
    if (error)
      throw new Error(`Upload refused for ${fixture.descriptor.objectKey}: ${error.message}`);
    if (data.path !== fixture.descriptor.objectKey) {
      throw new Error(
        `Supabase returned an unexpected object path for ${fixture.descriptor.objectKey}.`,
      );
    }

    process.stdout.write(
      `uploaded ${fixture.descriptor.objectKey}: sha256=${fixture.descriptor.sha256}\n`,
    );
  }
}

const isDirect =
  process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isDirect) {
  try {
    await uploadFixtures();
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
