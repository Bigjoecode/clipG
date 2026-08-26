import { createDatabaseClient, type PrismaClient } from '@clipgenius/database';
import { parseDatabaseEnvironment } from '@clipgenius/config';
import {
  Global,
  Inject,
  Injectable,
  Module,
  type OnApplicationShutdown,
} from '@nestjs/common';

export const DATABASE_CLIENT = Symbol('DATABASE_CLIENT');

@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  public constructor(
    @Inject(DATABASE_CLIENT) private readonly database: PrismaClient,
  ) {}

  public async onApplicationShutdown(): Promise<void> {
    await this.database.$disconnect();
  }
}

@Global()
@Module({
  exports: [DATABASE_CLIENT],
  providers: [
    {
      provide: DATABASE_CLIENT,
      useFactory: (): PrismaClient => {
        const environment = parseDatabaseEnvironment(process.env);
        return createDatabaseClient({
          connectionString: environment.DATABASE_URL,
        });
      },
    },
    DatabaseLifecycle,
  ],
})
export class DatabaseModule {}
