"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const core_1 = require("@nestjs/core");
const platform_fastify_1 = require("@nestjs/platform-fastify");
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const app_module_1 = require("./app.module");
const colors = {
    reset: '\x1b[0m',
    cyan: '\x1b[36m',
    green: '\x1b[32m',
};
async function bootstrap() {
    const app = await core_1.NestFactory.create(app_module_1.AppModule, new platform_fastify_1.FastifyAdapter());
    app.enableCors({
        origin: process.env.APP_URL ?? 'http://localhost:3000',
    });
    app.useGlobalPipes(new common_1.ValidationPipe({ whitelist: true, transform: true }));
    const config = new swagger_1.DocumentBuilder()
        .setTitle('Opensync API')
        .setVersion('0.1.0')
        .addBearerAuth()
        .build();
    swagger_1.SwaggerModule.setup('docs', app, swagger_1.SwaggerModule.createDocument(app, config));
    const host = '0.0.0.0';
    const port = Number(process.env.PORT ?? 3001);
    await app.listen(port, host);
    console.log(`${colors.green}✅ API online na porta ${port}${colors.reset}`);
    console.log(`${colors.cyan}🚀 Backend pronto para desenvolvimento${colors.reset}`);
}
bootstrap();
