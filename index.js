/*
 * Copyright 2025 Peter Neid
 * Copyright 2025 The Secureblue Authors
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under the License is
 * distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and limitations under the License.
 */

import { getInput, info, setFailed } from "@actions/core";
import { context, getOctokit } from "@actions/github";

async function getReviews() {
  const client = getOctokit(token);
  return await client.paginate.iterator(client.rest.pulls.listReviews, {
      pull_number: pullRequestId,
      owner: context.repo.owner,
      repo: context.repo.repo,
      per_page: 100,
  });
}

async function validateInput() {
  const token = getInput('token', { required: true });
  if (!token) {
    setFailed(`Input parameter 'token' is required`);
    return;
  }

  const minRequiredStr = getInput('min-required', { required: true })
  if (!minRequiredStr) {
    setFailed(`Input parameter 'min-required' is required`);
    return;
  }

  const pullRequestId = context.payload.pull_request?.number;
  if (!pullRequestId) {
    setFailed(`Unable to find associated pull request from the context: ${JSON.stringify(context)}`);
    return;
  }
}

async function run() {
  await validateInput();
  
  const skipDependabot = getInput('skip-dependabot', { required: false });
  if (skipDependabot && context.payload.sender.login === 'dependabot[bot]') {
    info("Skipping dependabot PR.")
    return;
  }
  const minRequired = parseInt(minRequiredStr, 10);
  const approversString = getInput('approvers', { required: true });
  const approvers = approversString.split('\n').map(s => s.trim());
  const allReviews = await getReviews();

  let validApprovers = new Set();
  for await (const { data: reviews } of allReviews) {
      for (const review of reviews) {
        const userId = review.user?.login;
        if (review.state === 'APPROVED' && userId) {
            if (approvers.includes(userId)) {
                validApprovers.add(userId);
            }
        }
     }
  }

  if (validApprovers.size > 0) {
    info(`Found approvals from ${[...validApprovers].join(', ')}`);
  } else {
    info("No approvals found.")
  }

  if (validApprovers.size < minRequired) {
    setFailed(`Not enough approvals; has ${validApprovers.size} where ${minRequired} approvals are required.`);
  } else {
    info(`Meets minimum number of approvals requirement with ${validApprovers.size} approvals`);
  }
}

run();
