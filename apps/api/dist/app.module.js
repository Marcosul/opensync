"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const throttler_1 = require("@nestjs/throttler");
const ionos_module_1 = require("./ionos/ionos.module");
const auth_module_1 = require("./auth/auth.module");
const vaults_module_1 = require("./vaults/vaults.module");
const workspaces_module_1 = require("./workspaces/workspaces.module");
const sync_module_1 = require("./sync/sync.module");
const commits_module_1 = require("./commits/commits.module");
const graph_module_1 = require("./graph/graph.module");
const plans_module_1 = require("./plans/plans.module");
const billing_module_1 = require("./billing/billing.module");
const health_controller_1 = require("./health.controller");
const prisma_module_1 = require("./common/prisma.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        controllers: [health_controller_1.HealthController],
        imports: [
            throttler_1.ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }]),
            prisma_module_1.PrismaModule,
            ionos_module_1.IonosModule,
            auth_module_1.AuthModule,
            vaults_module_1.VaultsModule,
            workspaces_module_1.WorkspacesModule,
            sync_module_1.SyncModule,
            commits_module_1.CommitsModule,
            graph_module_1.GraphModule,
            plans_module_1.PlansModule,
            billing_module_1.BillingModule,
        ],
    })
], AppModule);
