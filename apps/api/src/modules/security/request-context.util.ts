import type { Request } from 'express';
import * as geoip from 'geoip-lite';
import { UAParser } from 'ua-parser-js';
import { sha256 } from '../../common/crypto/phi-crypto';

/**
 * Request-fingerprinting helpers for the security subsystem: client IP, parsed
 * User-Agent, IP geolocation, a stable per-device id, and the Haversine
 * distance used by impossible-travel detection. All pure and null-safe — dev
 * loopback IPs simply geolocate to nulls rather than throwing.
 */

export interface ParsedUa {
  browser?: string;
  os?: string;
  device?: string;
  /** Human label e.g. "Chrome on macOS" for session/device lists. */
  deviceName?: string;
}

export interface GeoLocation {
  country?: string;
  city?: string;
  lat?: number;
  lng?: number;
}

export interface RequestContext extends ParsedUa, GeoLocation {
  ipAddress: string;
  userAgent?: string;
  deviceId: string;
}

/** Best-effort real client IP: first hop of X-Forwarded-For, else socket IP. */
export function getClientIp(req: Request): string {
  const fwd = req.headers['x-forwarded-for'];
  const raw = Array.isArray(fwd) ? fwd[0] : fwd?.split(',')[0]?.trim();
  const ip = raw || req.ip || req.socket?.remoteAddress || '0.0.0.0';
  // Normalise IPv4-mapped IPv6 (::ffff:1.2.3.4) and loopback.
  return ip.replace(/^::ffff:/, '').replace(/^::1$/, '127.0.0.1');
}

/** Parse a User-Agent into browser/os/device + a friendly device name. */
export function parseUserAgent(userAgent?: string): ParsedUa {
  if (!userAgent) return {};
  const r = new UAParser(userAgent).getResult();
  const browser = r.browser.name || undefined;
  const os = [r.os.name, r.os.version].filter(Boolean).join(' ') || undefined;
  const device =
    [r.device.vendor, r.device.model].filter(Boolean).join(' ') ||
    (r.device.type ? r.device.type : 'Desktop');
  const deviceName = [browser, r.os.name].filter(Boolean).join(' on ') || undefined;
  return { browser, os, device, deviceName };
}

/** Geolocate an IP. Loopback/private/unknown IPs return an empty object. */
export function geolocate(ip: string): GeoLocation {
  const geo = geoip.lookup(ip);
  if (!geo) return {};
  return {
    country: geo.country || undefined,
    city: geo.city || undefined,
    lat: geo.ll?.[0],
    lng: geo.ll?.[1],
  };
}

/**
 * Stable device id: SHA-256 of userId + userAgent + ipAddress. Stable per
 * device (same browser/IP), so it survives token rotation but distinguishes a
 * genuinely new device/network for MFA and session tracking.
 */
export function computeDeviceId(userId: string, userAgent: string | undefined, ip: string): string {
  return sha256(`${userId}|${userAgent ?? ''}|${ip}`);
}

/** Assemble the full request context for a known user. */
export function buildRequestContext(userId: string, req: Request): RequestContext {
  const ipAddress = getClientIp(req);
  const userAgent = req.headers['user-agent'];
  const ua = parseUserAgent(userAgent);
  const geo = geolocate(ipAddress);
  return {
    ipAddress,
    userAgent,
    deviceId: computeDeviceId(userId, userAgent, ipAddress),
    ...ua,
    ...geo,
  };
}

const EARTH_RADIUS_KM = 6371;
const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km between two lat/lng points (Haversine). */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}
