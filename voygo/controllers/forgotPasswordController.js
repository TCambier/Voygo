// forgot-password.js - Gestion du modal mot de passe oublié
document.addEventListener('DOMContentLoaded', function() {
    // Get the modal
    var modal = document.getElementById('forgot-password-modal');

    // Get the link that opens the modal
    var link = document.getElementById('forgot-password-link');

    // Get the <span> element that closes the modal
    var span = document.getElementsByClassName('close')[0];

    // When the user clicks the link, open the modal
    link.onclick = function(event) {
        event.preventDefault();
        modal.style.display = 'block';
    }

    // When the user clicks on <span> (x), close the modal
    span.onclick = function() {
        modal.style.display = 'none';
    }

    // When the user clicks anywhere outside of the modal, close it
    window.onclick = function(event) {
        if (event.target == modal) {
            modal.style.display = 'none';
        }
    }

    // Handle send button
    document.getElementById('send-btn').onclick = function() {
        var email = document.getElementById('forgot-email').value;
        if (email) {
            alert('Email envoyé à ' + email);
            modal.style.display = 'none';
        } else {
            alert('Veuillez entrer un email valide.');
        }
    }
});