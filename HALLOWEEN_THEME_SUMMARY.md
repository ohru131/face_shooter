# Face Shooter - Halloween Wizard Theme Update

## ブランチ情報
- **ブランチ名**: `feature/halloween-wizard-theme`
- **リポジトリ**: https://github.com/ohru131/face_shooter
- **プルリクエスト作成URL**: https://github.com/ohru131/face_shooter/pull/new/feature/halloween-wizard-theme

## 変更概要

添付画像のハロウィンキャラクターのテイストに合わせて、ゲーム全体のデザインを一新しました。

### 新しいプレイヤーキャラクター（魔法使い）
紫色のローブと帽子を身につけた可愛い魔法使いキャラクターです。
- 6種類のバリエーション（中央/左/右 × 口閉じ/口開き）
- 口を開けると魔法を詠唱するエフェクト付き

| 状態 | 画像 |
|------|------|
| 中央・口閉じ | player_center_closed.png |
| 中央・口開き | player_center_open.png |
| 左向き・口閉じ | player_left_closed.png |
| 左向き・口開き | player_left_open.png |
| 右向き・口閉じ | player_right_closed.png |
| 右向き・口開き | player_right_open.png |

### 新しい敵キャラクター（ハロウィンモンスター）
4種類のハロウィンモンスターが登場します。

| キャラクター | ファイル名 | 特徴 |
|-------------|-----------|------|
| ドラキュラ | yokai_vampire.png | 高速移動 |
| 狼男 | yokai_werewolf.png | 標準速度 |
| ミイラ男 | yokai_mummy.png | 低速移動 |
| フランケンシュタイン | yokai_frankenstein.png | やや低速 |

### 新しい回復アイテム（かぼちゃ）
ジャック・オー・ランタンのかぼちゃキャラクターが回復アイテムとして登場します。
- ファイル: item_powerup.png
- 効果: パワーアップ + ライフ回復

### 新しい攻撃エフェクト（魔法の星）
紫と金色の魔法の星が攻撃エフェクトとして使用されます。
- ファイル: projectile_voice.png
- 魔法の軌跡エフェクト付き

### 新しい背景
ハロウィンの夜をイメージした背景です。
- 満月と城のシルエット
- 飛び交うコウモリ
- 紫とオレンジのグラデーション空

### 新しいUI
ハロウィンテーマに合わせた紫とオレンジのカラースキームです。
- ゲームタイトル: 「Witch Shooter」
- ハートアイコン: ハロウィンデザイン
- 紫の発光エフェクト

### 新しいオーディオ
ハロウィンの雰囲気に合った音楽と効果音を追加しました。

| ファイル | 説明 |
|---------|------|
| bgm_halloween.wav | ハロウィンBGM（16秒ループ） |
| sfx_shoot.wav | 魔法発射音 |
| sfx_explosion.wav | 爆発音 |
| sfx_damage.wav | ダメージ音 |
| sfx_powerup.wav | パワーアップ音 |
| sfx_gameover.wav | ゲームオーバー音 |

## 技術的な変更

### GameCanvas.tsx
- 敵タイプを `kappa/umbrella/lantern` から `vampire/werewolf/mummy/frankenstein` に変更
- オーディオシステムをWeb Audio APIベースのWAVファイル再生に更新
- BGMのループ再生機能を追加
- UIカラースキームをハロウィンテーマに変更
- パーティクルエフェクトを紫/オレンジに変更

### index.css
- ハロウィンテーマのCSSクラスを追加
  - `.halloween-glow`: 紫の発光エフェクト
  - `.halloween-border`: 紫のボーダーと影
  - `.spooky-text`: スプーキーなテキストシャドウ
  - `.float-animation`: 浮遊アニメーション
  - `.spooky-pulse`: 不気味なパルスアニメーション

## ファイル一覧

### 新規追加ファイル
```
client/public/audio/
├── bgm_halloween.wav
├── sfx_damage.wav
├── sfx_explosion.wav
├── sfx_gameover.wav
├── sfx_powerup.wav
└── sfx_shoot.wav

client/public/images/
├── enemy_frankenstein.png
├── enemy_mummy.png
├── enemy_vampire.png
├── enemy_werewolf.png
├── icon_heart_halloween.png
├── item_pumpkin.png
├── projectile_magic.png
├── yokai_frankenstein.png
├── yokai_mummy.png
├── yokai_vampire.png
└── yokai_werewolf.png
```

### 更新ファイル
```
client/public/images/
├── game_background.png
├── item_powerup.png
├── player_center_closed.png
├── player_center_open.png
├── player_left_closed.png
├── player_left_open.png
├── player_right_closed.png
├── player_right_open.png
└── projectile_voice.png

client/src/
├── components/GameCanvas.tsx
└── index.css
```

## 使用方法

1. ブランチをチェックアウト:
   ```bash
   git checkout feature/halloween-wizard-theme
   ```

2. 依存関係をインストール:
   ```bash
   pnpm install
   ```

3. 開発サーバーを起動:
   ```bash
   pnpm dev
   ```

4. ブラウザで http://localhost:5173 にアクセス

## スクリーンショット

キャラクターは添付画像のハロウィンテイストに合わせた可愛いちびキャラスタイルで統一されています。
