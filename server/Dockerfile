# Use a base image with Node.js
FROM node:18-alpine

# Set the working directory
WORKDIR /usr/src/app

# Copy the useful files
COPY package*.json ./
COPY tsconfig.json ./
COPY src ./src

# Install & Compile
RUN npm install
RUN npm run build

# Expose the app port (3000)
EXPOSE 3000

# Command to run the compiled app
CMD ["npm", "run", "start"]
