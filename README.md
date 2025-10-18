# MorsEye 👁️

A web-based application that converts Morse code blinks into readable text using computer vision and real-time eye tracking.

## 🌟 Features

- **Real-time Eye Tracking**: Uses webcam to detect eye blinks
- **Morse Code Translation**: Converts blink patterns (dots and dashes) into text
- **Interactive Web Interface**: Clean, user-friendly design for easy interaction
- **Live Feedback**: Real-time display of detected Morse code and translated text
- **Browser-Based**: Runs entirely in your web browser

## 🚀 Demo

Simply blink in Morse code patterns:
- **Short blink** = Dot (·)
- **Long blink** = Dash (−)
- Pause between letters to separate characters
- Longer pause to separate words

## 📋 Prerequisites

- Python 3.7+
- Webcam
- Modern web browser (Chrome, Firefox, Edge)

## 📁 Project Structure

```
MorsEye/
│
├── app.py              # Backend with eye tracking logic
├── index.html          # Main web interface
├── style.css           # Styling for the web interface
├── script.js           # Frontend JavaScript logic
└── README.md           # Project documentation
```

## 🛠️ Technologies Used

- **Backend**: 
  - Python
  - OpenCV (Computer vision)
  - MediaPipe (Face mesh detection)
  
- **Frontend**:
  - HTML5
  - CSS
  - JavaScript
  - Python

## 📖 How It Works

1. The webcam captures your face in real-time
2. MediaPipe's Face Mesh detects facial landmarks, including eyes
3. Eye blink patterns are analyzed to determine dots and dashes
4. The Morse code is translated into text using standard Morse code mappings
5. Results are displayed on the web interface in real-time

## 🎯 Morse Code Reference

| Letter | Code | Letter | Code | Number | Code |
|--------|------|--------|------|--------|------|
| A | ·− | N | −· | 0 | −−−−− |
| B | −··· | O | −−− | 1 | ·−−−− |
| C | −·−· | P | ·−−· | 2 | ··−−− |
| D | −·· | Q | −−·− | 3 | ···−− |
| E | · | R | ·−· | 4 | ····− |
| F | ··−· | S | ··· | 5 | ····· |
| G | −−· | T | − | 6 | −···· |
| H | ···· | U | ··− | 7 | −−··· |
| I | ·· | V | ···− | 8 | −−−·· |
| J | ·−−− | W | ·−− | 9 | −−−−· |
| K | −·− | X | −··− | | |
| L | ·−·· | Y | −·−− | | |
| M | −− | Z | −−·· | | |

## 🤝 Contributing

Contributions are welcome! Feel free to:
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.