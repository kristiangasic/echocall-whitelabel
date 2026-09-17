import { Body, Controller, Delete, HttpCode, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser, Roles } from '../../auth/decorators.js';
import type { SessionUser } from '../../auth/session.service.js';
import { ZodValidationPipe } from '../../common/zod-validation.pipe.js';
import {
  AdminCustomersService,
  type CreateCustomerResult,
  type CustomerLoginResult,
} from './admin-customers.service.js';
import {
  type CreateCustomerDto,
  createCustomerSchema,
  customerIdSchema,
  type UpdateCustomerDto,
  updateCustomerSchema,
} from './dto.js';

const idPipe = () => new ZodValidationPipe(customerIdSchema);

/**
 * The customer list itself is read from the hub through the operator proxy.
 * Only the changes that touch both sides live here.
 */
@Controller('admin/customers')
@Roles('admin')
export class AdminCustomersController {
  constructor(private readonly customers: AdminCustomersService) {}

  @Post()
  @HttpCode(201)
  create(
    @Body(new ZodValidationPipe(createCustomerSchema)) body: CreateCustomerDto,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<CreateCustomerResult> {
    return this.customers.create(body, { actor, ip: req.ip });
  }

  @Patch(':id')
  update(
    @Param('id', idPipe()) id: number,
    @Body(new ZodValidationPipe(updateCustomerSchema)) body: UpdateCustomerDto,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<CustomerLoginResult> {
    return this.customers.update(id, body, { actor, ip: req.ip });
  }

  @Post(':id/suspend')
  @HttpCode(200)
  suspend(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<CustomerLoginResult> {
    return this.customers.suspend(id, { actor, ip: req.ip });
  }

  @Post(':id/unsuspend')
  @HttpCode(200)
  unsuspend(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<CustomerLoginResult> {
    return this.customers.unsuspend(id, { actor, ip: req.ip });
  }

  @Delete(':id')
  @HttpCode(204)
  remove(
    @Param('id', idPipe()) id: number,
    @CurrentUser() actor: SessionUser,
    @Req() req: Request,
  ): Promise<void> {
    return this.customers.remove(id, { actor, ip: req.ip });
  }
}
