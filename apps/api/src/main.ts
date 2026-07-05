import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import * as cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const prefix = process.env.API_PREFIX ?? 'api/v1';
  app.setGlobalPrefix(prefix);

  // Trust the reverse proxy so req.ip / X-Forwarded-For reflect the real client
  // (needed for IP blocking, geolocation, and rate limiting behind a proxy).
  app.getHttpAdapter().getInstance().set('trust proxy', 1);

  // Parse cookies so the JWT strategy can read the HttpOnly access-token cookie.
  app.use(cookieParser());

  // Security headers (HIPAA / OWASP). CSP is strict; the API serves JSON +
  // Swagger only. 'unsafe-inline' on styles is required by Swagger UI.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:'],
          connectSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      hsts: { maxAge: 31536000, includeSubDomains: true },
      frameguard: { action: 'deny' },
      noSniff: true,
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    }),
  );

  // Cookie auth requires credentialed CORS. `origin: true` reflects the request
  // origin (valid with credentials, unlike a literal wildcard).
  app.enableCors({ origin: true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('Cytolab API')
    .setDescription('Cytolab LIMS — rebuilt as a NestJS modular monolith')
    .setVersion('2.0.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup(`${prefix}/docs`, app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`Cytolab API running on http://localhost:${port}/${prefix}`);
}

bootstrap();
