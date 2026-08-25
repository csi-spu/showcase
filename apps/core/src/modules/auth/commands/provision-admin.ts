import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../../app.module';
import {
  AdminProvisioningError,
  AdminProvisioningService,
} from '../application/admin-provisioning.service';

interface ProvisioningService {
  provision(input: { adminLogin: string }): Promise<{
    adminLogin: string;
    temporaryPassword: string;
  }>;
}

interface CommandOutput {
  stderr(value: string): void;
  stdout(value: string): void;
}

export async function runProvisionAdmin(
  args: string[],
  service: ProvisioningService,
  output: CommandOutput,
): Promise<0 | 1> {
  const commandArgs = args[0] === '--' ? args.slice(1) : args;
  const adminLogin = commandArgs[0];
  if (commandArgs.length !== 1 || adminLogin === undefined) {
    output.stderr('Usage: pnpm --filter @showcase/core admin:provision -- <admin-login>\n');
    return 1;
  }
  try {
    const result = await service.provision({ adminLogin });
    output.stdout(
      `Admin login: ${result.adminLogin}\nTemporary password: ${result.temporaryPassword}\n`,
    );
    return 0;
  } catch (error: unknown) {
    const errorCode =
      error instanceof AdminProvisioningError ? error.code : 'ADMIN_PROVISIONING_FAILED';
    output.stderr(`Admin provisioning failed: ${errorCode}\n`);
    return 1;
  }
}

async function main(): Promise<void> {
  const application = await NestFactory.createApplicationContext(AppModule, { logger: false });
  try {
    process.exitCode = await runProvisionAdmin(
      process.argv.slice(2),
      application.get(AdminProvisioningService),
      {
        stderr: (value) => process.stderr.write(value),
        stdout: (value) => process.stdout.write(value),
      },
    );
  } finally {
    await application.close();
  }
}

if (require.main === module) {
  void main();
}
