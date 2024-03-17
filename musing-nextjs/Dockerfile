# Use an official Node runtime as a parent image
FROM node:18

# Set the working directory in the container
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Bundle app source
COPY . .

# Build your Next.js app
RUN npm run build

# Your application runs on port 3000. Expose it!
EXPOSE 3000

# Command to run the app
CMD ["npm", "start"]

