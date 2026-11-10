# 都道府県境界データ（data/prefectures.json）

- 出典：地球地図日本（国土地理院） https://www.gsi.go.jp/kankyochiri/gm_jpn.html
- 変換元：dataofjapan/land の japan.geojson https://github.com/dataofjapan/land
- 加工：mapshaper で 10% に簡略化し、都道府県名（`nam_ja`）だけを `name` として残した
- 利用条件：配布元に準じる。非営利目的では出典（地球地図日本）を明記する。営利目的では出典の明記に加えて著作権者への利用報告が必要
