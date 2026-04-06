import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, NestFastifyApplication } from '@nestjs/platform-fastify';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';

const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
};

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

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
  console.log(`${colors.cyan}🚀 Backend pronto para desenvolvimento${colors.reset}`);
}

bootstrap();
