# Use official Node.js LTS image
FROM node:18-alpine

# Set working directory
WORKDIR /app


# Install git
RUN apk add --no-cache git

# Clone the repo (main branch) into /app
RUN git clone --branch main https://github.com/kinabraytan/streams.git .

# Install dependencies
RUN npm install --production

# Expose port (default for Stremio add-ons is 7000, change if needed)
EXPOSE 7000

# Start the add-on
CMD ["npm", "start"]
