import cv2
import numpy as np
import time
from collections import deque

class MorseCodeDecoder:
    def __init__(self):
        self.last_activity_time = time.time()
        self.morse_dict = {
            '.-': 'A', '-...': 'B', '-.-.': 'C', '-..': 'D', '.': 'E',
            '..-.': 'F', '--.': 'G', '....': 'H', '..': 'I', '.---': 'J',
            '-.-': 'K', '.-..': 'L', '--': 'M', '-.': 'N', '---': 'O',
            '.--.': 'P', '--.-': 'Q', '.-.': 'R', '...': 'S', '-': 'T',
            '..-': 'U', '...-': 'V', '.--': 'W', '-..-': 'X', '-.--': 'Y',
            '--..': 'Z', '.----': '1', '..---': '2', '...--': '3',
            '....-': '4', '.....': '5', '-....': '6', '--...': '7',
            '---..': '8', '----.': '9', '-----': '0'
        }
        self.dot_threshold = 0.3
        self.dash_threshold = 0.8 
        self.letter_gap = 0.2 
        self.word_gap = 3.0 
        
        self.blink_start = None
        self.last_blink_end = None
        self.current_morse = ""
        self.decoded_text = ""
        self.is_blinking = False
        self.blink_history = deque(maxlen=50)
        
        self.detection_buffer = deque(maxlen=5)
        
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
        self.eye_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_eye.xml')
        
        self.mode = 'eyes'
        self.light_threshold = 200 
        
    def detect_eyes_closed(self, frame, face):
        """Detect if eyes are closed in the given face region"""
        x, y, w, h = face
        roi_gray = cv2.cvtColor(frame[y:y+h, x:x+w], cv2.COLOR_BGR2GRAY)
        eyes = self.eye_cascade.detectMultiScale(roi_gray, scaleFactor=1.1, minNeighbors=3)
        
        return len(eyes) == 0
    
    def detect_light_on(self, frame, roi=None):
        """Detect if a bright light/LED is on in the frame or ROI"""
        if roi:
            x, y, w, h = roi
            region = frame[y:y+h, x:x+w]
        else:
            region = frame
            
        gray = cv2.cvtColor(region, cv2.COLOR_BGR2GRAY)
        max_brightness = np.max(gray)
        
        return max_brightness > self.light_threshold
    
    def process_blink(self, is_blink_detected):
        """Process blink state and decode Morse code"""
        current_time = time.time()
        
        self.detection_buffer.append(is_blink_detected)
        smoothed_detection = sum(self.detection_buffer) > len(self.detection_buffer) // 2
        
        if smoothed_detection and not self.is_blinking:
            self.blink_start = current_time
            self.is_blinking = True
            self.last_activity_time = current_time
            print("Blink started")
            
        elif not smoothed_detection and self.is_blinking:
            blink_duration = current_time - self.blink_start
            self.last_blink_end = current_time
            self.is_blinking = False
            
            if blink_duration < self.dot_threshold:
                self.current_morse += "."
                self.blink_history.append((".", blink_duration))
                print("Dot detected")
            elif blink_duration < self.dash_threshold:
                self.current_morse += "-"
                self.blink_history.append(("-", blink_duration))
                print("Dash detected")
            else:
                print("Blink too long, ignored")
            
            self.last_activity_time = current_time
        
        if not self.is_blinking and self.last_blink_end:
            gap = current_time - self.last_blink_end
            
            if gap > self.word_gap and self.current_morse:
                self.decode_current_morse()
                self.decoded_text += " "
                print("Word gap detected")
                self.current_morse = ""
                self.last_blink_end = None
            
            elif gap > self.letter_gap * 1.5 and self.current_morse:
                self.decode_current_morse()
                print("Letter gap detected")
                self.current_morse = ""
                self.last_blink_end = None

    
    def decode_current_morse(self):
        """Decode the current Morse code sequence to a letter"""
        if self.current_morse in self.morse_dict:
            self.decoded_text += self.morse_dict[self.current_morse]
        self.current_morse = ""
    
    def draw_ui(self, frame):
        """Draw UI elements on the frame"""
        height, width = frame.shape[:2]
        
        mode_text = f"Mode: {'Eye Blink' if self.mode == 'eyes' else 'Light Detection'}"
        cv2.putText(frame, mode_text, (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        
        cv2.putText(frame, f"Current: {self.current_morse}", (10, 60), 
                   cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 0), 2)
        
        if self.is_blinking:
            cv2.circle(frame, (width - 50, 50), 20, (0, 0, 255), -1)
        else:
            cv2.circle(frame, (width - 50, 50), 20, (100, 100, 100), 2)
        
        box_height = 100
        overlay = frame.copy()
        cv2.rectangle(overlay, (10, height - box_height - 10), 
                     (width - 10, height - 10), (0, 0, 0), -1)
        cv2.addWeighted(overlay, 0.7, frame, 0.3, 0, frame)
        
        cv2.putText(frame, "Decoded Text:", (20, height - box_height + 20),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        
        text_to_show = self.decoded_text[-50:]  # Show last 50 characters
        cv2.putText(frame, text_to_show, (20, height - box_height + 50),
                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2)
        
        instructions = [
            "Press 'e' for eye blink mode",
            "Press 'l' for light detection mode",
            "Press 'c' to clear text",
            "Press 'q' to quit"
        ]
        for i, instruction in enumerate(instructions):
            cv2.putText(frame, instruction, (10, height - box_height - 30 - (i * 25)),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
        
        return frame
    
    def run(self):
        """Main loop for the Morse code decoder"""
        cap = cv2.VideoCapture(0)
        
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        
        print("Morse Code Blink Decoder Started!")
        print("Press 'e' for eye blink mode, 'l' for light detection mode")
        print("Press 'c' to clear text, 'q' to quit")
        
        light_roi = None
        selecting_roi = False
        
        def mouse_callback(event, x, y, flags, param):
            nonlocal light_roi, selecting_roi
            if event == cv2.EVENT_LBUTTONDOWN:
                selecting_roi = True
                light_roi = [x, y, 0, 0]
            elif event == cv2.EVENT_MOUSEMOVE and selecting_roi:
                light_roi[2] = x - light_roi[0]
                light_roi[3] = y - light_roi[1]
            elif event == cv2.EVENT_LBUTTONUP:
                selecting_roi = False
                if light_roi[2] < 0:
                    light_roi[0] += light_roi[2]
                    light_roi[2] = abs(light_roi[2])
                if light_roi[3] < 0:
                    light_roi[1] += light_roi[3]
                    light_roi[3] = abs(light_roi[3])
        
        cv2.namedWindow('Morse Code Decoder')
        cv2.setMouseCallback('Morse Code Decoder', mouse_callback)
        
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            
            frame = cv2.flip(frame, 1)
            
            is_blink_detected = False
            
            if self.mode == 'eyes':
                gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, 1.3, 5)
                
                for face in faces:
                    x, y, w, h = face
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (255, 0, 0), 2)
                    is_blink_detected = self.detect_eyes_closed(frame, face)
                    break 
            
            elif self.mode == 'light':
                if light_roi and not selecting_roi:
                    x, y, w, h = light_roi
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 0), 2)
                    is_blink_detected = self.detect_light_on(frame, light_roi)
                else:
                    is_blink_detected = self.detect_light_on(frame)
                
                if selecting_roi and light_roi:
                    x, y, w, h = light_roi
                    cv2.rectangle(frame, (x, y), (x+w, y+h), (0, 255, 255), 2)
            
            self.process_blink(is_blink_detected)
            frame = self.draw_ui(frame)
            cv2.imshow('Morse Code Decoder', frame)
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'):
                break
            elif key == ord('e'):
                self.mode = 'eyes'
                light_roi = None
            elif key == ord('l'):
                self.mode = 'light'
                print("Click and drag to select light region (optional)")
            elif key == ord('c'):
                self.decoded_text = ""
                self.current_morse = ""
                print("Text cleared!")
            elif key == ord(' '):
                self.decoded_text += " "
        
        cap.release()
        cv2.destroyAllWindows()
        
        if self.decoded_text:
            print(f"\nFinal decoded text: {self.decoded_text}")

if __name__ == "__main__":
    decoder = MorseCodeDecoder()
    decoder.run()