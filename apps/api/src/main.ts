import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  magenta: '\x1b[35m',
};

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );
  app.setGlobalPrefix('api');

  const fastify = app.getHttpAdapter().getInstance();
  fastify.get('/', async (_req, reply) => {
    console.log(
      `${colors.magenta}🏠 Alguém acessou a raiz (GET /) — redirecionando mentalmente para /docs ✨${colors.reset}`,
    );
    return reply.status(200).type('application/json').send({
      message:
        'Opensync API. Esta é a raiz: use /docs para o Swagger e /api/health para o status.',
      docs: '/docs',
      health: '/api/health',
    });
  });

  app.enableCors({
    origin: process.env.APP_URL ?? 'http://localhost:3000',
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true }),
  );

  const config = new DocumentBuilder()
    .setTitle('Opensync API')
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();
  SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));

  const host = '0.0.0.0';
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, host);
  console.log(`${colors.green}✅ API online na porta ${port}${colors.reset}`);
  console.log(`${colors.cyan}🩺 Health check: /api/health${colors.reset}`);
  console.log(`${colors.cyan}🚀 Backend pronto para desenvolvimento${colors.reset}`);
}

bootstrap();
