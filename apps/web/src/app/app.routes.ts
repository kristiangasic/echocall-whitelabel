import { inject } from '@angular/core';
import type { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';
import { AuthStore } from './core/auth/auth.store';
import { homePath, roleGuard } from './core/auth/role.guard';
import { setupGuard } from './core/setup/setup.guard';
import { ShellComponent } from './layout/shell.component';

export const routes: Routes = [
  {
    path: 'setup',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/setup/setup.page').then((m) => m.SetupPage),
  },
  {
    path: 'login',
    canActivate: [setupGuard],
    loadComponent: () => import('./features/auth/login.page').then((m) => m.LoginPage),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('./features/auth/forgot-password.page').then((m) => m.ForgotPasswordPage),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.page').then((m) => m.ResetPasswordPage),
  },
  {
    path: 'accept-invite',
    loadComponent: () => import('./features/auth/accept-invite.page').then((m) => m.AcceptInvitePage),
  },
  {
    path: '',
    canActivate: [authGuard],
    component: ShellComponent,
    children: [
      { path: '', pathMatch: 'full', redirectTo: () => homePath(inject(AuthStore).user()?.role) },
      {
        path: 'account',
        loadComponent: () => import('./features/account/account.page').then((m) => m.AccountPage),
      },
      {
        path: 'admin',
        canActivate: [roleGuard('admin')],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/admin/overview/admin-overview.page').then((m) => m.AdminOverviewPage),
          },
          {
            path: 'users',
            loadComponent: () =>
              import('./features/admin/users/admin-users.page').then((m) => m.AdminUsersPage),
          },
          {
            path: 'settings',
            loadComponent: () =>
              import('./features/admin/settings/admin-settings.page').then((m) => m.AdminSettingsPage),
          },
          {
            path: 'audit',
            loadComponent: () =>
              import('./features/admin/audit/admin-audit.page').then((m) => m.AdminAuditPage),
          },
        ],
      },
      {
        path: 'app',
        canActivate: [roleGuard('user')],
        children: [
          {
            path: '',
            loadComponent: () =>
              import('./features/user/dashboard/user-dashboard.page').then((m) => m.UserDashboardPage),
          },
          {
            path: 'agents',
            loadComponent: () => import('./features/user/agents/agents.page').then((m) => m.AgentsPage),
          },
          {
            path: 'agents/:id',
            loadComponent: () =>
              import('./features/user/agents/agent-edit.page').then((m) => m.AgentEditPage),
          },
          {
            path: 'chatbots',
            loadComponent: () =>
              import('./features/user/chatbots/chatbots.page').then((m) => m.ChatbotsPage),
          },
          {
            path: 'chatbots/:id',
            loadComponent: () =>
              import('./features/user/chatbots/chatbot-edit.page').then((m) => m.ChatbotEditPage),
          },
          {
            path: 'numbers',
            loadComponent: () =>
              import('./features/user/phone-numbers/phone-numbers.page').then((m) => m.PhoneNumbersPage),
          },
          {
            path: 'conversations',
            loadComponent: () =>
              import('./features/user/conversations/conversations.page').then((m) => m.ConversationsPage),
          },
          {
            path: 'conversations/:id',
            loadComponent: () =>
              import('./features/user/conversations/conversation-detail.page').then(
                (m) => m.ConversationDetailPage,
              ),
          },
          {
            path: 'inbox',
            loadComponent: () =>
              import('./features/user/conversations/live-inbox.page').then((m) => m.LiveInboxPage),
          },
        ],
      },
    ],
  },
  { path: '**', redirectTo: '' },
];
