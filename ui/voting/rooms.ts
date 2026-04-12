/* ── Private room CRUD and localStorage persistence ──────── */

import type { PrivateRoom } from "./types"

const ROOMS_KEY = "peckish:rooms"
const ACTIVE_ROOM_KEY = "peckish:activeRoom"

/* ── Module state ────────────────────────────────────────── */

let _activeRoom: PrivateRoom | null = null
let _knownRooms: PrivateRoom[] = []

/* ── Persistence helpers ─────────────────────────────────── */

function isValidRoom(v: unknown): v is PrivateRoom {
  return typeof v === "object" && v !== null
    && typeof (v as PrivateRoom).id === "string"
    && typeof (v as PrivateRoom).name === "string"
    && typeof (v as PrivateRoom).joinedAt === "number"
}

export function loadRooms(): void {
  try {
    const raw = localStorage.getItem(ROOMS_KEY)
    const parsed = raw ? JSON.parse(raw) : []
    _knownRooms = Array.isArray(parsed) ? parsed.filter(isValidRoom) : []
  } catch {
    _knownRooms = []
  }
  const activeId = localStorage.getItem(ACTIVE_ROOM_KEY)
  _activeRoom = activeId ? findRoomById(activeId) ?? null : null
}

function saveRooms(): void {
  localStorage.setItem(ROOMS_KEY, JSON.stringify(_knownRooms))
}

function saveActiveRoom(): void {
  if (_activeRoom) {
    localStorage.setItem(ACTIVE_ROOM_KEY, _activeRoom.id)
  } else {
    localStorage.removeItem(ACTIVE_ROOM_KEY)
  }
}

/* ── Room ID generation ──────────────────────────────────── */

function generateRoomId(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"
  const arr = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(arr, (b) => chars[b % chars.length]).join("")
}

/* ── Room payload encode/decode ──────────────────────────── */

export function encodeRoomPayload(room: PrivateRoom): string {
  return btoa(JSON.stringify({ id: room.id, name: room.name }))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "")
}

export function decodeRoomPayload(encoded: string): { id: string; name: string } | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/")
    const { id, name } = JSON.parse(atob(padded))
    if (typeof id !== "string" || typeof name !== "string") return null
    return { id, name: sanitizeRoomName(name) }
  } catch {
    return null
  }
}

/* ── Getters ─────────────────────────────────────────────── */

export function getActiveRoom(): PrivateRoom | null {
  return _activeRoom
}

export function getKnownRooms(): readonly PrivateRoom[] {
  return _knownRooms
}

export function findRoomById(id: string): PrivateRoom | undefined {
  return _knownRooms.find((r) => r.id === id)
}

const MAX_ROOM_NAME_LENGTH = 64

function sanitizeRoomName(name: string): string {
  return name.trim().slice(0, MAX_ROOM_NAME_LENGTH)
}

/* ── Mutators ────────────────────────────────────────────── */

export function setActiveRoomDirect(room: PrivateRoom | null): void {
  _activeRoom = room
  saveActiveRoom()
}

export function addRoom(room: PrivateRoom): void {
  if (!_knownRooms.some((r) => r.id === room.id)) {
    _knownRooms.push(room)
    saveRooms()
  }
}

export function removeRoom(roomId: string): void {
  _knownRooms = _knownRooms.filter((r) => r.id !== roomId)
  saveRooms()
}

export function createRoom(name: string): PrivateRoom {
  const room: PrivateRoom = { id: generateRoomId(), name: sanitizeRoomName(name), joinedAt: Date.now() }
  _knownRooms.push(room)
  saveRooms()
  return room
}

export function renameRoom(roomId: string, newName: string): void {
  const room = findRoomById(roomId)
  if (!room) return
  room.name = sanitizeRoomName(newName)
  saveRooms()
  if (_activeRoom?.id === roomId) _activeRoom = room
}

export function resetRooms(): void {
  _activeRoom = null
  _knownRooms = []
}
