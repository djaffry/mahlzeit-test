import type { Avatar } from "./types"

export const FOOD_EMOJIS: readonly { emoji: string; name: string }[] = [
  { emoji: "\u{1F355}", name: "Pizza" },
  { emoji: "\u{1F32E}", name: "Taco" },
  { emoji: "\u{1F363}", name: "Sushi" },
  { emoji: "\u{1F950}", name: "Croissant" },
  { emoji: "\u{1F35C}", name: "Ramen" },
  { emoji: "\u{1F354}", name: "Burger" },
  { emoji: "\u{1F957}", name: "Salad" },
  { emoji: "\u{1F371}", name: "Bento" },
  { emoji: "\u{1F9C1}", name: "Cupcake" },
  { emoji: "\u{1F369}", name: "Donut" },
  { emoji: "\u{1F95F}", name: "Dumpling" },
  { emoji: "\u{1F35D}", name: "Spaghetti" },
  { emoji: "\u{1F32F}", name: "Burrito" },
  { emoji: "\u{1F959}", name: "Pita" },
  { emoji: "\u{1F35B}", name: "Curry" },
  { emoji: "\u{1F958}", name: "Stew" },
  { emoji: "\u{1FAD5}", name: "Fondue" },
  { emoji: "\u{1F364}", name: "Tempura" },
  { emoji: "\u{1F95E}", name: "Pancake" },
  { emoji: "\u{1F9C6}", name: "Falafel" },
  { emoji: "\u{1F359}", name: "Onigiri" },
  { emoji: "\u{1F951}", name: "Avocado" },
  { emoji: "\u{1F347}", name: "Grape" },
  { emoji: "\u{1FAD2}", name: "Olive" },
  { emoji: "\u{1F37F}", name: "Popcorn" },
  { emoji: "\u{1F968}", name: "Pretzel" },
  { emoji: "\u{1F9C0}", name: "Cheese" },
  { emoji: "\u{1F36A}", name: "Cookie" },
  { emoji: "\u{1F95D}", name: "Kiwi" },
  { emoji: "\u{1FAD3}", name: "Flatbread" },
  { emoji: "\u{1F96E}", name: "Mooncake" },
  { emoji: "\u{1F35E}", name: "Bread" },
  { emoji: "\u{1F952}", name: "Cucumber" },
  { emoji: "\u{1F966}", name: "Broccoli" },
  { emoji: "\u{1F955}", name: "Carrot" },
  { emoji: "\u{1F956}", name: "Baguette" },
  { emoji: "\u{1F9C7}", name: "Waffle" },
  { emoji: "\u{1F953}", name: "Bacon" },
  { emoji: "\u{1F360}", name: "Potato" },
  { emoji: "\u{1F361}", name: "Dango" },
  { emoji: "\u{1F362}", name: "Oden" },
  { emoji: "\u{1F370}", name: "Cake" },
  { emoji: "\u{1F382}", name: "Gateau" },
  { emoji: "\u{1F967}", name: "Pie" },
  { emoji: "\u{1F96F}", name: "Bagel" },
  { emoji: "\u{1F9C2}", name: "Salt" },
  { emoji: "\u{1FAD4}", name: "Tamale" },
  { emoji: "\u{1F954}", name: "Spud" },
  { emoji: "\u{1F960}", name: "Fortune" },
  { emoji: "\u{1F36B}", name: "Chocolate" },
]

export const AVATAR_COLORS = [
  { name: "coral", hex: "#e78fa7" },
  { name: "peach", hex: "#fab387" },
  { name: "yellow", hex: "#f9e2af" },
  { name: "green", hex: "#a6e3a1" },
  { name: "teal", hex: "#94e2d5" },
  { name: "sky", hex: "#89dceb" },
  { name: "blue", hex: "#89b4fa" },
  { name: "lavender", hex: "#b4befe" },
  { name: "mauve", hex: "#cba6f7" },
  { name: "pink", hex: "#f5c2e7" },
  { name: "flamingo", hex: "#f2cdcd" },
  { name: "rosewater", hex: "#f5e0dc" },
  { name: "maroon", hex: "#eba0ac" },
  { name: "red", hex: "#f38ba8" },
  { name: "sapphire", hex: "#74c7ec" },
] as const

function hashToIndices(pubkey: string): { emojiIndex: number; colorIndex: number } {
  const emojiHash = parseInt(pubkey.slice(0, 8), 16)
  const colorHash = parseInt(pubkey.slice(8, 16), 16)
  return {
    emojiIndex: emojiHash % FOOD_EMOJIS.length,
    colorIndex: colorHash % AVATAR_COLORS.length,
  }
}

const _cache = new Map<string, Avatar>()

export function getAvatar(pubkey: string): Avatar {
  let cached = _cache.get(pubkey)
  if (cached) return cached
  const { emojiIndex, colorIndex } = hashToIndices(pubkey)
  const food = FOOD_EMOJIS[emojiIndex]
  const color = AVATAR_COLORS[colorIndex]
  cached = {
    emoji: food.emoji,
    color: color.hex,
    label: `The ${color.name[0].toUpperCase() + color.name.slice(1)} ${food.name}`,
  }
  _cache.set(pubkey, cached)
  return cached
}
