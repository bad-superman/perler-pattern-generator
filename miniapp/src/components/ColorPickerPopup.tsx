import { ScrollView, Text, View } from '@tarojs/components'
import type { BeadPaletteEntry } from '../../../src/palettes'
import { isDarkHex } from '../../../src/pattern/color'
import type { PaletteColor } from '../../../src/pattern/types'

interface ColorPickerPopupProps {
  palette: PaletteColor[]
  selectedPaletteIndex: number
  brandColors: readonly BeadPaletteEntry[]
  /** A colour that is already part of the pattern's palette. */
  onSelectPalette: (paletteIndex: number) => void
  /** Any colour of the brand; the caller adds it to the palette when needed. */
  onSelectBrand: (entry: BeadPaletteEntry) => void
  onClose: () => void
}

function chipStyle(hex: string) {
  return { backgroundColor: hex, color: isDarkHex(hex) ? '#ffffff' : '#1d1a23' }
}

/** Full-screen colour picker: colours used by the pattern first, then the whole brand palette. */
export function ColorPickerPopup({ palette, selectedPaletteIndex, brandColors, onSelectPalette, onSelectBrand, onClose }: ColorPickerPopupProps) {
  const selected = palette[selectedPaletteIndex]
  const usedColors = palette
    .map((color, index) => ({ color, index }))
    .filter(({ color }) => color.count > 0)
    .sort((a, b) => b.color.count - a.color.count)

  return (
    <View className="color-popup">
      <View className="color-popup-head">
        <View className="color-popup-titles">
          <Text className="color-popup-title">选择颜色</Text>
          <Text className="color-popup-current">当前：{selected ? selected.code : '未选择'}</Text>
        </View>
        <View className="color-popup-close" onClick={onClose}><Text>关闭</Text></View>
      </View>
      <ScrollView className="color-popup-body" scrollY>
        <Text className="color-popup-section">图纸颜色</Text>
        {usedColors.length ? (
          <View className="color-grid">
            {usedColors.map(({ color, index }) => (
              <View key={color.code} className={index === selectedPaletteIndex ? 'color-swatch active' : 'color-swatch'} onClick={() => onSelectPalette(index)}>
                <View className="color-swatch-chip" style={chipStyle(color.hex)}><Text>{color.code}</Text></View>
                <Text className="color-swatch-count">{color.count}</Text>
              </View>
            ))}
          </View>
        ) : (
          <Text className="color-popup-empty">图纸上还没有颜色，从下方全部颜色中选一个开始绘制。</Text>
        )}
        <Text className="color-popup-section">全部颜色</Text>
        <View className="color-grid">
          {brandColors.map((entry) => (
            <View key={entry[0]} className={selected?.code === entry[0] ? 'color-swatch active' : 'color-swatch'} onClick={() => onSelectBrand(entry)}>
              <View className="color-swatch-chip" style={chipStyle(entry[2])}><Text>{entry[0]}</Text></View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}
