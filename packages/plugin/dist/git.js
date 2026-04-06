"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initGit = initGit;
exports.commitAll = commitAll;
exports.pushToApi = pushToApi;
const simple_git_1 = require("simple-git");
async function initGit(workspaceDir) {
    const git = (0, simple_git_1.simpleGit)(workspaceDir);
    const isRepo = await git.checkIsRepo().catch(() => false);
    if (!isRepo) {
        await git.init();
    }
}
async function commitAll(workspaceDir, message) {
    const git = (0, simple_git_1.simpleGit)(workspaceDir);
    await git.add('.');
    const result = await git.commit(message);
    return result.commit;
}
async function pushToApi(workspaceDir, apiUrl, token) {
    const git = (0, simple_git_1.simpleGit)(workspaceDir);
    const remote = `${apiUrl}`;
    await git.env('GIT_ASKPASS', 'echo').addConfig('http.extraHeader', `Authorization: Bearer ${token}`);
    await git.push(remote, 'main', ['--force-with-lease']);
}
//# sourceMappingURL=git.js.map