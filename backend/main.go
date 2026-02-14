package main

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"time"

	aisstream "github.com/aisstream/ais-message-models/golang/aisStream"
	"github.com/gorilla/websocket"
	_ "github.com/joho/godotenv/autoload"
)

type ShipPosition struct {
	Name      string  `json:"name"`
	Latitude  float64 `json:"latitude"`
	Longitude float64 `json:"longitude"`
}

type Hub struct {
	clients    map[*Client]struct{}
	broadcast  chan ShipPosition
	register   chan *Client
	unregister chan *Client
}

func newHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]struct{}),
		broadcast:  make(chan ShipPosition, 100),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

func (h *Hub) activeClients() int {
	return len(h.clients)
}

func (h *Hub) run() {
	for {
		select {
		case client := <-h.register:
			h.clients[client] = struct{}{}
			log.Printf("Client connected. Total: %d", len(h.clients))

		case client := <-h.unregister:
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.send)
				log.Printf("Client disconnected. Total: %d", len(h.clients))
			}

		case position := <-h.broadcast:
			positionBytes, _ := json.Marshal(position)
			for client := range h.clients {
				select {
				case client.send <- positionBytes:
				default:
					close(client.send)
					delete(h.clients, client)
				}
			}
		}
	}
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn
	send chan []byte
}

func (c *Client) writePump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for message := range c.send {
		if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
			return
		}
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	for {
		if _, _, err := c.conn.ReadMessage(); err != nil {
			break
		}
	}
}

func serveWs(hub *Hub, allowedOrigin string, w http.ResponseWriter, r *http.Request) {
	upgrader := websocket.Upgrader{
		CheckOrigin: func(r *http.Request) bool {
			return r.Header.Get("Origin") == allowedOrigin
		},
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Println(err)
		return
	}

	client := &Client{
		hub:  hub,
		conn: conn,
		send: make(chan []byte, 256),
	}

	client.hub.register <- client

	go client.writePump()
	go client.readPump()
}

func main() {
	apiKey, ok := os.LookupEnv("AIS_API_KEY")
	if !ok {
		log.Fatalln("Please set AIS_API_KEY environment variable.")
	}
	allowedOrigin, ok := os.LookupEnv("ORIGIN")
	if !ok {
		log.Fatalln("Please set ORIGIN environment variable (e.g., http://localhost:3000)")
	}

	port, ok := os.LookupEnv("PORT")
	if !ok {
		port = "8080"
	}

	hub := newHub()
	go hub.run()

	http.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWs(hub, allowedOrigin, w, r)
	})

	go func() {
		log.Printf("WebSocket server listening on :%s", port)
		if err := http.ListenAndServe(":"+port, nil); err != nil {
			log.Fatalf("HTTP server error: %v", err)
		}
	}()

	readAISStream(apiKey, hub)
}

func readAISStream(apiKey string, hub *Hub) {
	var ws *websocket.Conn
	var err error

	for {
		for hub.activeClients() == 0 {
			time.Sleep(1 * time.Second)
		}

		ws, _, err = websocket.DefaultDialer.Dial("wss://stream.aisstream.io/v0/stream", nil)
		if err != nil {
			log.Printf("AIS connect failed: %v", err)
			time.Sleep(5 * time.Second)
			continue
		}
		log.Println("Connected to AIS Stream")

		subMsg := aisstream.SubscriptionMessage{
			APIKey:             apiKey,
			BoundingBoxes:      [][][]float64{{{-90.0, -180.0}, {90.0, 180.0}}},
			FilterMessageTypes: []aisstream.AisMessageTypes{aisstream.POSITION_REPORT},
		}
		subMsgBytes, _ := json.Marshal(subMsg)
		ws.WriteMessage(websocket.TextMessage, subMsgBytes)

		for hub.activeClients() > 0 {
			_, p, err := ws.ReadMessage()
			if err != nil {
				log.Printf("AIS read error: %v", err)
				break
			}

			var packet aisstream.AisStreamMessage
			if err := json.Unmarshal(p, &packet); err != nil {
				log.Printf("Unmarshal error: %v", err)
				continue
			}

			if position := messageToShipPosition(packet); position != nil {
				hub.broadcast <- *position
			}
		}

		ws.Close()
		log.Println("Disconnected from AIS (no clients or error).")
		time.Sleep(1 * time.Second)
	}
}

func messageToShipPosition(msg aisstream.AisStreamMessage) *ShipPosition {
	if msg.MessageType != aisstream.POSITION_REPORT {
		return nil
	}
	var positionReport aisstream.PositionReport
	if shipName, ok := msg.MetaData["ShipName"]; ok {
		positionReport = *msg.Message.PositionReport
		return &ShipPosition{
			Name:      shipName.(string),
			Latitude:  positionReport.Latitude,
			Longitude: positionReport.Longitude,
		}
	}
	return nil
}
