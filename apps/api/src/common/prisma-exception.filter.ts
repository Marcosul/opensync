import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply } from 'fastify';

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
};

@Catch(Prisma.PrismaClientKnownRequestError)
export class PrismaKnownRequestExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaKnownRequestExceptionFilter.name);

  catch(exception: Prisma.PrismaClientKnownRequestError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = exception.message;

    switch (exception.code) {
      case 'P2002':
        status = HttpStatus.CONFLICT;
        message = 'Registro duplicado.';
        break;
      case 'P2003':
        status = HttpStatus.BAD_REQUEST;
        message = 'Referencia invalida (chave estrangeira).';
        break;
      case 'P2021':
        status = HttpStatus.INTERNAL_SERVER_ERROR;
        message =
          'Tabela ausente no banco (ex.: public.vaults). Rode a migration SQL no Postgres e reinicie a API.';
        break;
      case 'P2025':
        status = HttpStatus.NOT_FOUND;
        message = 'Registro nao encontrado.';
        break;
      default:
        message = `[${exception.code}] ${exception.message}`;
    }

    this.logger.error(
      `${colors.red}🗄️ Prisma ${exception.code}:${colors.reset} ${exception.message}`,
    );

    return reply.status(status).send({
      statusCode: status,
      message,
      code: exception.code,
    });
  }
}

@Catch(Prisma.PrismaClientValidationError)
export class PrismaValidationExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(PrismaValidationExceptionFilter.name);

  catch(exception: Prisma.PrismaClientValidationError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<FastifyReply>();
    this.logger.error(
      `${colors.yellow}📋 Prisma validation:${colors.reset} ${exception.message}`,
    );
    return reply.status(HttpStatus.BAD_REQUEST).send({
      statusCode: HttpStatus.BAD_REQUEST,
      message: 'Dados invalidos para o banco.',
    });
  }
}
