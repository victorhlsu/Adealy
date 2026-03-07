# Temp Frontend (API Tester) Dockerfile
FROM node:20-alpine

WORKDIR /app

# Create a basic package.json if not exists and install dependencies
RUN npm init -y && npm install express

# Copy application files
COPY app.js ./
COPY index.html ./
COPY styles.css ./

# Expose port
EXPOSE 3000

# Start the app
CMD ["node", "app.js"]
