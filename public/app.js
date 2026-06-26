// Parse URL parameters provided by the VideoSDK engine
const urlParams = new URLSearchParams(window.location.search);
const meetingId = urlParams.get("meetingId");
const token = urlParams.get("token");

if (!meetingId || !token) {
    console.error("Missing meetingId or token in URL parameters");
    document.getElementById("aiMessage").innerText = "Error: Missing meeting configuration.";
}

let meeting;

// Initialize VideoSDK Meeting
function init() {
    window.VideoSDK.config(token);

    meeting = window.VideoSDK.initMeeting({
        meetingId: meetingId,
        name: "Livestream Template Bot",
        micEnabled: false,
        webcamEnabled: false,
        maxResolution: "hd",
        joinWithoutUserInteraction: true, // Crucial for headless template
    });

    setupMeetingEvents();
    meeting.join();
}

function setupMeetingEvents() {
    // When the template bot joins the meeting
    meeting.on("meeting-joined", () => {
        console.log("Template Bot joined the meeting");
        setupPubSub();
    });

    // When a participant joins
    meeting.on("participant-joined", (participant) => {
        console.log("Participant joined:", participant.id);
        createParticipantVideo(participant);
        
        participant.on("stream-enabled", (stream) => {
            if (stream.kind === "video") {
                const mediaStream = new MediaStream();
                mediaStream.addTrack(stream.track);
                const videoEl = document.getElementById(`v-${participant.id}`);
                if (videoEl) {
                    videoEl.srcObject = mediaStream;
                    videoEl.play().catch(e => console.error("Video play error:", e));
                }
            }
            if (stream.kind === "audio") {
                const mediaStream = new MediaStream();
                mediaStream.addTrack(stream.track);
                const audioEl = document.getElementById(`a-${participant.id}`);
                if (audioEl) {
                    audioEl.srcObject = mediaStream;
                    audioEl.play().catch(e => console.error("Audio play error:", e));
                }
            }
        });
        
        participant.on("stream-disabled", (stream) => {
            if (stream.kind === "video") {
                const videoEl = document.getElementById(`v-${participant.id}`);
                if (videoEl) videoEl.srcObject = null;
            }
        });
    });

    // When a participant leaves
    meeting.on("participant-left", (participant) => {
        const container = document.getElementById(`container-${participant.id}`);
        if (container) container.remove();
    });
}

function createParticipantVideo(participant) {
    const grid = document.getElementById("videoContainer");
    
    const container = document.createElement("div");
    container.id = `container-${participant.id}`;
    container.className = "participant-video-container";

    const video = document.createElement("video");
    video.id = `v-${participant.id}`;
    video.autoplay = true;
    video.playsInline = true;
    
    const audio = document.createElement("audio");
    audio.id = `a-${participant.id}`;
    audio.autoplay = true;

    container.appendChild(video);
    container.appendChild(audio);
    grid.appendChild(container);
}

// Setup PubSub listener for AI Insights
function setupPubSub() {
    meeting.pubSub.subscribe("AI_INSIGHTS", (message) => {
        console.log("Received AI Insight:", message.message);
        showOverlay(message.message);
    });
}

let overlayTimeout;

// Show the overlay with animation
function showOverlay(text) {
    const overlay = document.getElementById("aiOverlay");
    const messageEl = document.getElementById("aiMessage");
    
    // Set text
    messageEl.innerText = text;
    
    // Show overlay
    overlay.classList.remove("hidden");
    overlay.classList.add("visible");
    
    // Clear any existing timeout
    if (overlayTimeout) clearTimeout(overlayTimeout);
    
    // Hide overlay after 10 seconds
    overlayTimeout = setTimeout(() => {
        overlay.classList.remove("visible");
        overlay.classList.add("hidden");
    }, 10000);
}

// Start initialization if params exist
if (meetingId && token) {
    init();
}
