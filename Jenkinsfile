pipeline {
    agent any

    stages {

        stage('Clone Repository') {
            steps {
                git branch: 'newmain',
                    url: 'https://github.com/mirul49/Team4_Project.git'
            }
        }

        stage('Deploy to AWS EC2') {
            steps {
                sh '''
                ansible-playbook \
                -i ansible/inventory.ini \
                ansible/deploy.yaml
                '''
            }
        }
    }
}