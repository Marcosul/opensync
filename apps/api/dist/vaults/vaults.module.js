"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.VaultsModule = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const sync_module_1 = require("../sync/sync.module");
const vault_files_module_1 = require("../vault-files/vault-files.module");
const workspaces_module_1 = require("../workspaces/workspaces.module");
const public_vaults_controller_1 = require("./public-vaults.controller");
const vaults_controller_1 = require("./vaults.controller");
const vaults_service_1 = require("./vaults.service");
const graph_service_1 = require("./graph.service");
let VaultsModule = class VaultsModule {
};
exports.VaultsModule = VaultsModule;
exports.VaultsModule = VaultsModule = __decorate([
    (0, common_1.Module)({
        imports: [sync_module_1.SyncModule, vault_files_module_1.VaultFilesModule, workspaces_module_1.WorkspacesModule, throttler_1.ThrottlerModule],
        controllers: [vaults_controller_1.VaultsController, public_vaults_controller_1.PublicVaultsController],
        providers: [vaults_service_1.VaultsService, graph_service_1.GraphService],
        exports: [vaults_service_1.VaultsService],
    })
], VaultsModule);
