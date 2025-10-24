# 🏏 Cricket Auction App

Live auction application for cricket player bidding with random selection and real-time management.

## 🌐 Live Demo
[https://nawabjaffer.github.io/cricket-auction-app/](https://nawabjaffer.github.io/cricket-auction-app/)

## 📁 Files Structure

```
auctionApp/
├── index.html              # Main application
├── config.js               # Configuration (Google Sheets, API keys)
├── GoogleAppsScript.gs     # Backend webhook script
├── assets/                 # Images and sounds
│   ├── BG.jpg             # Background image
│   ├── sold.mp3           # Sold sound effect
│   ├── unsold.mp3         # Unsold sound effect
│   └── coinsshake.mp3     # Coin jar sound effect
└── CONFIG_README.md       # Configuration guide
```

## ⚙️ Configuration

Edit `config.js` to set:
- Google Sheets ID
- API Key
- Webhook URL
- Auction rules and settings

See `CONFIG_README.md` for detailed instructions.

## 🚀 Deployment

Already deployed on GitHub Pages. To update:

```bash
git add .
git commit -m "Update app"
git push origin main
```

Wait 1-2 minutes for changes to go live.

## ✨ Features

- ✅ Random player selection with coin jar animation
- ✅ Real-time bidding with validation
- ✅ Per-player base pricing
- ✅ Sound effects (sold/unsold/coin shake)
- ✅ Google Sheets integration
- ✅ Two-round auction system
- ✅ Mobile responsive design

## 📞 Support

For configuration help, see `CONFIG_README.md`

---

**Version**: 2.0 | **Optimized**: Production Ready
