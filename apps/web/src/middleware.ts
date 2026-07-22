import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const ROLE_COOKIE = 'fo_role';

const CUSTOMER_ONLY = ['/menu', '/cart', '/checkout', '/orders', '/dashboard', '/profile'];
const ADMIN_ONLY = ['/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const role = request.cookies.get(ROLE_COOKIE)?.value;

  const isCustomerRoute = CUSTOMER_ONLY.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  const isAdminRoute = ADMIN_ONLY.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  if (pathname === '/' && role === 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/orders';
    return NextResponse.redirect(url);
  }

  if (isAdminRoute) {
    if (role !== 'admin') {
      const url = request.nextUrl.clone();
      url.pathname = role === 'customer' ? '/menu' : '/auth/login';
      url.searchParams.set('redirect', pathname);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isCustomerRoute && role === 'admin') {
    const url = request.nextUrl.clone();
    url.pathname = '/admin/orders';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/menu/:path*',
    '/menu',
    '/cart/:path*',
    '/cart',
    '/checkout/:path*',
    '/checkout',
    '/orders/:path*',
    '/orders',
    '/dashboard/:path*',
    '/dashboard',
    '/profile/:path*',
    '/profile',
  ],
};
